import type {
  AnalyticsSummary,
  ApiKeyRecord,
  ForecastRecord,
  GatewaySettings,
  Incident,
  PredictiveAdjustment,
  RatePoint,
  RequestLog,
  ServiceName
} from "../shared/types";

type Bucket = {
  tokens: number;
  lastRefill: number;
};

type Override = {
  limit: number;
  expiresAt: number;
};

export class GatewayStore {
  private buckets = new Map<string, Bucket>();
  private overrides = new Map<string, Override>();
  private apiKeys: ApiKeyRecord[] = [
    {
      id: crypto.randomUUID(),
      name: "Acme Production",
      key: "acme",
      role: "client",
      enabled: true,
      createdAt: Date.now() - 86_400_000,
      usageCount: 0,
      currentLimit: 70,
      remainingTokens: 70
    },
    {
      id: crypto.randomUUID(),
      name: "Globex Partner",
      key: "globex",
      role: "client",
      enabled: true,
      createdAt: Date.now() - 43_200_000,
      usageCount: 0,
      currentLimit: 70,
      remainingTokens: 70
    },
    {
      id: crypto.randomUUID(),
      name: "Admin Console",
      key: "initech",
      role: "admin",
      enabled: true,
      createdAt: Date.now() - 21_600_000,
      usageCount: 0,
      currentLimit: 70,
      remainingTokens: 70
    }
  ];
  private requestLog: RequestLog[] = [];
  private rateSeries = new Map<string, RatePoint[]>();
  private forecasts: ForecastRecord[] = [];
  private adjustments: PredictiveAdjustment[] = [];
  private incidents: Incident[] = [];
  private settings: GatewaySettings = {
    defaultLimit: 70,
    forecastIntervalSeconds: 5,
    predictionHorizonSeconds: 30,
    adjustmentThreshold: 0.8,
    adjustmentRatio: 0.7,
    circuitFailureThreshold: 0.5,
    circuitCooldownSeconds: 15
  };

  seriesKey(apiKey: string, service: ServiceName) {
    return `${apiKey}:${service}`;
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(next: Partial<GatewaySettings>) {
    this.settings = { ...this.settings, ...next };
    this.refreshApiKeyStats();
    return this.settings;
  }

  listApiKeys() {
    this.refreshApiKeyStats();
    return this.apiKeys;
  }

  createApiKey(name: string, role: "admin" | "client" = "client") {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "client";
    const key = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
    const record: ApiKeyRecord = {
      id: crypto.randomUUID(),
      name,
      key,
      role,
      enabled: true,
      createdAt: Date.now(),
      usageCount: 0,
      currentLimit: this.settings.defaultLimit,
      remainingTokens: this.settings.defaultLimit
    };
    this.apiKeys = [record, ...this.apiKeys];
    return record;
  }

  updateApiKey(id: string, patch: Partial<Pick<ApiKeyRecord, "enabled" | "name" | "role">>) {
    this.apiKeys = this.apiKeys.map((record) => (record.id === id ? { ...record, ...patch } : record));
    return this.apiKeys.find((record) => record.id === id);
  }

  deleteApiKey(id: string) {
    const before = this.apiKeys.length;
    this.apiKeys = this.apiKeys.filter((record) => record.id !== id);
    return this.apiKeys.length < before;
  }

  resetDemoData() {
    this.buckets.clear();
    this.overrides.clear();
    this.requestLog = [];
    this.rateSeries.clear();
    this.forecasts = [];
    this.adjustments = [];
    this.incidents = [];
    this.apiKeys = this.apiKeys.map((record) => ({
      ...record,
      usageCount: 0,
      lastUsedAt: undefined,
      currentLimit: this.settings.defaultLimit,
      remainingTokens: this.settings.defaultLimit
    }));
  }

  isApiKeyAllowed(apiKey: string) {
    const record = this.apiKeys.find((key) => key.key === apiKey);
    return !record || record.enabled;
  }

  getCurrentLimit(apiKey: string) {
    const override = this.overrides.get(apiKey);
    if (override && override.expiresAt > Date.now()) return override.limit;
    if (override) this.overrides.delete(apiKey);
    return this.settings.defaultLimit;
  }

  setLimitOverride(apiKey: string, limit: number, ttlMs: number) {
    this.overrides.set(apiKey, { limit, expiresAt: Date.now() + ttlMs });
    this.refreshApiKeyStats();
  }

  consumeToken(apiKey: string) {
    const capacity = this.getCurrentLimit(apiKey);
    const refillRate = capacity / 10;
    const now = Date.now();
    const existing = this.buckets.get(apiKey) ?? { tokens: capacity, lastRefill: now };
    const elapsedSeconds = (now - existing.lastRefill) / 1000;
    const tokens = Math.min(capacity, existing.tokens + elapsedSeconds * refillRate);

    if (tokens < 1) {
      this.buckets.set(apiKey, { tokens, lastRefill: now });
      this.refreshApiKeyStats(apiKey);
      return { allowed: false, capacity, tokens };
    }

    this.buckets.set(apiKey, { tokens: tokens - 1, lastRefill: now });
    this.bumpUsage(apiKey);
    this.refreshApiKeyStats(apiKey);
    return { allowed: true, capacity, tokens: tokens - 1 };
  }

  logRequest(log: Omit<RequestLog, "id" | "timestamp"> & { timestamp?: number }) {
    const entry: RequestLog = {
      id: crypto.randomUUID(),
      timestamp: log.timestamp ?? Date.now(),
      apiKey: log.apiKey,
      client: log.client,
      service: log.service,
      endpoint: log.endpoint,
      method: log.method,
      status: log.status,
      latencyMs: log.latencyMs,
      ip: log.ip
    };
    this.requestLog = [entry, ...this.requestLog].slice(0, 5_000);
    return entry;
  }

  queryLogs(filters: { q?: string; status?: string; service?: string; apiKey?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 50));
    const q = filters.q?.toLowerCase().trim();
    const filtered = this.requestLog.filter((log) => {
      if (filters.status && String(log.status) !== filters.status) return false;
      if (filters.service && log.service !== filters.service) return false;
      if (filters.apiKey && log.apiKey !== filters.apiKey) return false;
      if (!q) return true;
      return [log.apiKey, log.client, log.endpoint, log.method, log.service, String(log.status)].some((value) =>
        value.toLowerCase().includes(q)
      );
    });
    return {
      rows: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  recentLogs(limit = 30) {
    return this.requestLog.slice(0, limit);
  }

  activePairs() {
    const pairs = new Map<string, { apiKey: string; service: ServiceName }>();
    const cutoff = Date.now() - 5 * 60_000;
    for (const request of this.requestLog) {
      if (request.timestamp < cutoff) continue;
      pairs.set(this.seriesKey(request.apiKey, request.service), {
        apiKey: request.apiKey,
        service: request.service
      });
    }
    return [...pairs.values()];
  }

  recentRatePoints(apiKey: string, service: ServiceName, windowMs = 60_000, bucketMs = 5_000) {
    const now = Date.now();
    const buckets = new Map<number, number>();
    for (let t = now - windowMs; t <= now; t += bucketMs) {
      buckets.set(Math.floor(t / bucketMs) * bucketMs, 0);
    }

    for (const request of this.requestLog) {
      if (request.apiKey !== apiKey || request.service !== service || now - request.timestamp > windowMs) continue;
      const bucket = Math.floor(request.timestamp / bucketMs) * bucketMs;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, count]) => ({ t: Math.round(t / 1000), rate: count / (bucketMs / 1000) }));
  }

  pushRatePoint(key: string, point: RatePoint) {
    const next = [...(this.rateSeries.get(key) ?? []), point].slice(-80);
    this.rateSeries.set(key, next);
  }

  addForecast(record: Omit<ForecastRecord, "id" | "timestamp">) {
    const forecast: ForecastRecord = { id: crypto.randomUUID(), timestamp: Date.now(), ...record };
    this.forecasts = [forecast, ...this.forecasts].slice(0, 500);
    return forecast;
  }

  markAdjusted(key: string, timestampSeconds: number) {
    const points = this.rateSeries.get(key) ?? [];
    const closest = points.reduce<RatePoint | null>((best, point) => {
      if (!best) return point;
      return Math.abs(point.t - timestampSeconds) < Math.abs(best.t - timestampSeconds) ? point : best;
    }, null);
    if (closest) closest.adjusted = true;
  }

  addAdjustment(adjustment: PredictiveAdjustment) {
    this.adjustments = [adjustment, ...this.adjustments].slice(0, 50);
  }

  updateAdjustmentText(id: string, token: string, done = false) {
    const item = this.adjustments.find((adjustment) => adjustment.id === id);
    if (!item) return;
    item.explanation += token;
    item.streaming = !done;
  }

  addIncident(incident: Incident) {
    this.incidents = [incident, ...this.incidents].slice(0, 50);
  }

  updateIncidentText(id: string, token: string, done = false) {
    const item = this.incidents.find((incident) => incident.id === id);
    if (!item) return;
    item.explanation += token;
    item.streaming = !done;
  }

  snapshotSeries() {
    return Object.fromEntries(this.rateSeries.entries());
  }

  snapshotForecasts() {
    return this.forecasts;
  }

  snapshotAdjustments() {
    return this.adjustments;
  }

  snapshotIncidents() {
    return this.incidents;
  }

  analytics(): AnalyticsSummary {
    const logs = this.requestLog;
    const totalRequests = logs.length;
    const successes = logs.filter((log) => log.status < 400).length;
    const serviceRows = new Map<ServiceName, { service: ServiceName; requests: number; errors: number }>();
    const statusRows = new Map<number, number>();
    const hourRows = new Map<string, number>();
    const clientRows = new Map<string, number>();

    for (const log of logs) {
      const service = serviceRows.get(log.service) ?? { service: log.service, requests: 0, errors: 0 };
      service.requests += 1;
      if (log.status >= 400) service.errors += 1;
      serviceRows.set(log.service, service);
      statusRows.set(log.status, (statusRows.get(log.status) ?? 0) + 1);
      clientRows.set(log.apiKey, (clientRows.get(log.apiKey) ?? 0) + 1);
      const label = new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      hourRows.set(label, (hourRows.get(label) ?? 0) + 1);
    }

    const byService = [...serviceRows.values()].sort((a, b) => b.requests - a.requests);
    const byStatus = [...statusRows.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
    const peakHours = [...hourRows.entries()].map(([label, requests]) => ({ label, requests })).slice(-24);
    const topClient = [...clientRows.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

    return {
      totalRequests,
      successRate: totalRequests ? successes / totalRequests : 1,
      rateLimited: logs.filter((log) => log.status === 429).length,
      downstreamErrors: logs.filter((log) => log.status >= 500).length,
      peakService: byService[0]?.service ?? "orders",
      topClient,
      byService,
      byStatus,
      peakHours
    };
  }

  csvLogs() {
    const header = "timestamp,client,apiKey,method,endpoint,service,status,latencyMs,ip";
    const rows = this.requestLog.map((log) =>
      [
        new Date(log.timestamp).toISOString(),
        log.client,
        log.apiKey,
        log.method,
        log.endpoint,
        log.service,
        log.status,
        log.latencyMs,
        log.ip
      ].join(",")
    );
    return [header, ...rows].join("\n");
  }

  private bumpUsage(apiKey: string) {
    this.apiKeys = this.apiKeys.map((record) =>
      record.key === apiKey ? { ...record, usageCount: record.usageCount + 1, lastUsedAt: Date.now() } : record
    );
  }

  private refreshApiKeyStats(apiKey?: string) {
    this.apiKeys = this.apiKeys.map((record) => {
      if (apiKey && record.key !== apiKey) return record;
      const bucket = this.buckets.get(record.key);
      const currentLimit = this.getCurrentLimit(record.key);
      return {
        ...record,
        currentLimit,
        remainingTokens: Math.max(0, Math.round(bucket?.tokens ?? currentLimit))
      };
    });
  }
}
