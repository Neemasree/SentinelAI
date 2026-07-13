import { db } from "./db";
import { redis, redisAvailable } from "./redis";
import type { ApiKeyRecord, ForecastRecord, Incident, PredictiveAdjustment, RequestLog, ServiceName, GatewaySettings, AnalyticsSummary, RatePoint } from "../shared/types";

type Bucket = { tokens: number; lastRefill: number };
type Override = { limit: number; expiresAt: number };

// In-memory fallback buckets when Redis is unavailable
const memBuckets = new Map<string, Bucket>();

export class DatabaseGatewayStore {
  private defaultSettings: GatewaySettings = {
    defaultLimit: 70,
    forecastIntervalSeconds: 5,
    predictionHorizonSeconds: 30,
    adjustmentThreshold: 0.8,
    adjustmentRatio: 0.7,
    circuitFailureThreshold: 0.5,
    circuitCooldownSeconds: 15
  };

  /**
   * Check if API key is valid and enabled
   */
  async isApiKeyAllowed(apiKeyString: string): Promise<boolean> {
    try {
      const key = await db.apiKey.findUnique({
        where: { key: apiKeyString },
        include: { user: true }
      });
      return key?.enabled && key.user.enabled ? true : false;
    } catch {
      return false;
    }
  }

  /**
   * Query logs from Postgres with the same filter shape as GatewayStore.queryLogs
   */
  async queryLogs(filters: {
    q?: string;
    status?: string;
    service?: string;
    apiKey?: string;
    userId?: string;   // if set, scope to this user's keys only
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: RequestLog[]; total: number }> {
    const pageSize = Math.min(500, Math.max(10, filters.pageSize ?? 50));
    const where: Record<string, unknown> = {};

    if (filters.userId) where.apiKey = { userId: filters.userId };
    if (filters.status) where.status = Number(filters.status);
    if (filters.service) where.service = filters.service;
    if (filters.apiKey) where.apiKey = { ...((where.apiKey as object) ?? {}), key: filters.apiKey };
    if (filters.q) {
      const q = filters.q.toLowerCase();
      where.OR = [
        { service: { contains: q, mode: "insensitive" } },
        { endpoint: { contains: q, mode: "insensitive" } },
        { method: { contains: q, mode: "insensitive" } },
        { client: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } }
      ];
    }

    const [records, total] = await Promise.all([
      db.requestLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: pageSize,
        include: { apiKey: true }
      }),
      db.requestLog.count({ where })
    ]);

    return {
      rows: records.map((r) => ({
        id: r.id,
        timestamp: r.timestamp.getTime(),
        apiKey: r.apiKey.key,
        client: r.client,
        service: r.service as ServiceName,
        endpoint: r.endpoint,
        method: r.method,
        status: r.status,
        latencyMs: r.latencyMs,
        ip: r.ip
      })),
      total
    };
  }

  /**
   * Get API key with user info
   */
  async getApiKeyWithUser(apiKeyString: string) {
    return db.apiKey.findUnique({
      where: { key: apiKeyString },
      include: { user: true }
    });
  }

  /**
   * Consume token from rate limiter (Redis-backed token bucket)
   */
  async consumeToken(apiKeyString: string): Promise<{ allowed: boolean; tokens: number; capacity: number }> {
    const capacity = this.defaultSettings.defaultLimit;
    const now = Date.now();

    let bucket: Bucket;

    if (redisAvailable.available) {
      try {
        const redisKey = `rate:${apiKeyString}`;
        const bucketJson = await redis.get(redisKey);
        bucket = bucketJson ? JSON.parse(bucketJson) : { tokens: capacity, lastRefill: now };
        const elapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * (capacity / 60));
        bucket.lastRefill = now;
        const allowed = bucket.tokens >= 1;
        if (allowed) bucket.tokens -= 1;
        await redis.setex(redisKey, 3600, JSON.stringify(bucket));
        try {
          await db.apiKey.update({
            where: { key: apiKeyString },
            data: { usageCount: { increment: 1 }, lastUsedAt: new Date(), remainingTokens: Math.round(bucket.tokens) }
          });
        } catch {}
        return { allowed, tokens: bucket.tokens, capacity };
      } catch {
        // Redis failed mid-request, fall through to memory
      }
    }

    // In-memory fallback
    bucket = memBuckets.get(apiKeyString) ?? { tokens: capacity, lastRefill: now };
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * (capacity / 60));
    bucket.lastRefill = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    memBuckets.set(apiKeyString, bucket);
    return { allowed, tokens: bucket.tokens, capacity };
  }

  /**
   * Log a request
   */
  async logRequest(req: {
    apiKeyId: string;
    apiKeyString: string;
    service: ServiceName;
    endpoint: string;
    method: string;
    status: number;
    latencyMs: number;
    ip: string;
    client: string;
  }): Promise<RequestLog> {
    const log = await db.requestLog.create({
      data: {
        apiKeyId: req.apiKeyId,
        service: req.service,
        endpoint: req.endpoint,
        method: req.method,
        status: req.status,
        latencyMs: req.latencyMs,
        ip: req.ip,
        client: req.client
      }
    });

    return {
      id: log.id,
      timestamp: log.timestamp.getTime(),
      apiKey: req.apiKeyString,
      client: req.client,
      service: log.service as ServiceName,
      endpoint: log.endpoint,
      method: log.method,
      status: log.status,
      latencyMs: log.latencyMs,
      ip: log.ip
    };
  }

  /**
   * Get recent logs for user
   */
  async recentLogs(userId: string, limit: number = 100): Promise<RequestLog[]> {
    const logs = await db.requestLog.findMany({
      where: {
        apiKey: {
          userId
        }
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { apiKey: true }
    });

    return logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.getTime(),
      apiKey: log.apiKey.key,
      client: log.client,
      service: log.service as ServiceName,
      endpoint: log.endpoint,
      method: log.method,
      status: log.status,
      latencyMs: log.latencyMs,
      ip: log.ip
    }));
  }

  /**
   * Push rate point for forecasting
   */
  async pushRatePoint(userId: string, service: ServiceName, point: RatePoint): Promise<void> {
    if (!redisAvailable.available) return;
    try {
      const redisKey = `rate-series:${userId}:${service}`;
      const series = await redis.lrange(redisKey, 0, -1);
      const points: RatePoint[] = series.map((s) => JSON.parse(s));
      points.push(point);
      if (points.length > 100) points.shift();
      await redis.del(redisKey);
      for (const p of points) await redis.rpush(redisKey, JSON.stringify(p));
      await redis.expire(redisKey, 3600);
    } catch {}
  }

  /**
   * Get recent rate points
   */
  async recentRatePoints(userId: string, service: ServiceName): Promise<RatePoint[]> {
    if (!redisAvailable.available) return [];
    try {
      const redisKey = `rate-series:${userId}:${service}`;
      const series = await redis.lrange(redisKey, 0, -1);
      return series.map((s) => JSON.parse(s) as RatePoint);
    } catch { return []; }
  }

  /**
   * Store forecast record
   */
  async recordForecast(req: {
    apiKeyId: string;
    service: ServiceName;
    currentRate: number;
    predictedRate: number;
    confidence: number;
    limitChanged: boolean;
  }): Promise<ForecastRecord> {
    const forecast = await db.forecastRecord.create({
      data: {
        apiKeyId: req.apiKeyId,
        service: req.service,
        currentRate: req.currentRate,
        predictedRate: req.predictedRate,
        confidence: req.confidence,
        limitChanged: req.limitChanged
      }
    });

    return {
      id: forecast.id,
      timestamp: forecast.timestamp.getTime(),
      apiKey: req.apiKeyId,
      service: forecast.service as ServiceName,
      currentRate: forecast.currentRate,
      predictedRate: forecast.predictedRate,
      confidence: forecast.confidence,
      limitChanged: forecast.limitChanged
    };
  }

  /**
   * Get forecasts for user
   */
  async forecasts(userId: string, limit: number = 50): Promise<ForecastRecord[]> {
    const records = await db.forecastRecord.findMany({
      where: {
        apiKey: {
          userId
        }
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { apiKey: true }
    });

    return records.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.getTime(),
      apiKey: r.apiKey.key,
      service: r.service as ServiceName,
      currentRate: r.currentRate,
      predictedRate: r.predictedRate,
      confidence: r.confidence,
      limitChanged: r.limitChanged
    }));
  }

  /**
   * Store predictive adjustment
   */
  async recordAdjustment(req: {
    apiKeyId: string;
    service: ServiceName;
    oldLimit: number;
    newLimit: number;
    predictedRate: number;
    slope: number;
    explanation?: string;
  }): Promise<PredictiveAdjustment> {
    const adjustment = await db.predictiveAdjustment.create({
      data: {
        apiKeyId: req.apiKeyId,
        service: req.service,
        oldLimit: req.oldLimit,
        newLimit: req.newLimit,
        predictedRate: req.predictedRate,
        slope: req.slope,
        explanation: req.explanation || ""
      }
    });

    return {
      id: adjustment.id,
      apiKey: req.apiKeyId,
      service: adjustment.service as ServiceName,
      oldLimit: adjustment.oldLimit,
      newLimit: adjustment.newLimit,
      predictedRate: adjustment.predictedRate,
      slope: adjustment.slope,
      timestamp: adjustment.timestamp.getTime(),
      explanation: adjustment.explanation || "",
      streaming: false
    };
  }

  /**
   * Get adjustments for user
   */
  async adjustments(userId: string, limit: number = 50): Promise<PredictiveAdjustment[]> {
    const records = await db.predictiveAdjustment.findMany({
      where: {
        apiKey: {
          userId
        }
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { apiKey: true }
    });

    return records.map((r) => ({
      id: r.id,
      apiKey: r.apiKey.key,
      service: r.service as ServiceName,
      oldLimit: r.oldLimit,
      newLimit: r.newLimit,
      predictedRate: r.predictedRate,
      slope: r.slope,
      timestamp: r.timestamp.getTime(),
      explanation: r.explanation || "",
      streaming: false
    }));
  }

  /**
   * Store incident
   */
  async recordIncident(req: {
    apiKeyId: string;
    service: ServiceName;
    failureRate: number;
    explanation?: string;
  }): Promise<Incident> {
    const incident = await db.incident.create({
      data: {
        apiKeyId: req.apiKeyId,
        service: req.service,
        failureRate: req.failureRate,
        explanation: req.explanation || ""
      }
    });

    return {
      id: incident.id,
      service: incident.service as ServiceName,
      apiKey: req.apiKeyId,
      failureRate: incident.failureRate,
      timestamp: incident.timestamp.getTime(),
      explanation: incident.explanation || "",
      streaming: false
    };
  }

  /**
   * Get incidents for user
   */
  async incidents(userId: string, limit: number = 50): Promise<Incident[]> {
    const records = await db.incident.findMany({
      where: {
        apiKey: {
          userId
        }
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { apiKey: true }
    });

    return records.map((r) => ({
      id: r.id,
      service: r.service as ServiceName,
      apiKey: r.apiKey.key,
      failureRate: r.failureRate,
      timestamp: r.timestamp.getTime(),
      explanation: r.explanation || "",
      streaming: false
    }));
  }

  /**
   * Update incident explanation (for streaming)
   */
  async updateIncidentExplanation(id: string, explanation: string): Promise<void> {
    await db.incident.update({
      where: { id },
      data: { explanation }
    });
  }

  /**
   * Get all API keys for user
   */
  async getUserApiKeys(userId: string): Promise<ApiKeyRecord[]> {
    const keys = await db.apiKey.findMany({
      where: { userId }
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      key: key.key,
      role: "client",
      enabled: key.enabled,
      createdAt: key.createdAt.getTime(),
      lastUsedAt: key.lastUsedAt?.getTime(),
      usageCount: key.usageCount,
      currentLimit: key.currentLimit,
      remainingTokens: key.remainingTokens
    }));
  }

  /**
   * Get analytics for user
   */
  async analytics(userId: string): Promise<AnalyticsSummary> {
    const logs = await db.requestLog.findMany({
      where: {
        apiKey: {
          userId
        }
      }
    });

    const totalRequests = logs.length;
    const successCount = logs.filter((l) => l.status === 200).length;
    const rateLimited = logs.filter((l) => l.status === 429).length;
    const downstreamErrors = logs.filter((l) => l.status >= 500).length;

    const byService = new Map<string, { requests: number; errors: number }>();
    const byStatus = new Map<number, number>();
    const byClient = new Map<string, number>();

    for (const log of logs) {
      // By service
      if (!byService.has(log.service)) byService.set(log.service, { requests: 0, errors: 0 });
      const sv = byService.get(log.service)!;
      sv.requests++;
      if (log.status >= 400) sv.errors++;

      // By status
      byStatus.set(log.status, (byStatus.get(log.status) ?? 0) + 1);

      // By client
      byClient.set(log.client, (byClient.get(log.client) ?? 0) + 1);
    }

    const peakService = Array.from(byService.entries()).sort((a, b) => b[1].requests - a[1].requests)[0]?.[0] || "orders";
    const topClient = Array.from(byClient.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";

    return {
      totalRequests,
      successRate: totalRequests > 0 ? successCount / totalRequests : 1,
      rateLimited,
      downstreamErrors,
      peakService: peakService as ServiceName,
      topClient,
      byService: Array.from(byService.entries()).map(([service, { requests, errors }]) => ({
        service: service as ServiceName,
        requests,
        errors
      })),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      peakHours: []
    };
  }

  /**
   * Log audit entry
   */
  async auditLog(userId: string, action: string, resource: string, oldValue?: string, newValue?: string): Promise<void> {
    await db.auditLog.create({
      data: {
        userId,
        action,
        resource,
        oldValue,
        newValue
      }
    });
  }

  /**
   * Get gateway settings (global, not per-user)
   */
  getSettings(): GatewaySettings {
    return this.defaultSettings;
  }
}
