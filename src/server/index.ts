import cors from "cors";
import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import type { DashboardSnapshot, Incident, ServiceName, ServiceStatus, SocketEvent } from "../shared/types";
import { CircuitBreaker } from "./circuitBreaker";
import { explainIncident, streamText } from "./explanation";
import { Forecaster } from "./forecaster";
import { GatewayStore } from "./stores";
import * as client from "prom-client";

const PORT = Number(process.env.PORT ?? 4000);
const SERVICES: ServiceName[] = ["orders", "billing", "inventory", "users", "payments"];
const CLIENTS = ["acme", "globex", "initech"];

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const store = new GatewayStore();
const breakers = new Map(SERVICES.map((service) => [service, new CircuitBreaker(service)]));

let rampTimer: NodeJS.Timeout | null = null;
let rampLevel = 0;
let incidentActive = false;
let incidentService: ServiceName = "orders";
let highLatencyActive = false;
let backgroundTimer: NodeJS.Timeout | null = null;

// Prometheus metrics
client.collectDefaultMetrics();
const requestCounter = new client.Counter({
  name: "gateway_requests_total",
  help: "Total gateway requests",
  labelNames: ["service", "status"]
});
const requestDuration = new client.Histogram({
  name: "gateway_request_duration_seconds",
  help: "Request duration in seconds",
  labelNames: ["service", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

app.get("/metrics", async (_req, res) => {
  try {
    res.setHeader("Content-Type", client.register.contentType || "text/plain");
    const metrics = await client.register.metrics();
    res.send(metrics);
  } catch (err) {
    res.status(500).send("Error collecting metrics");
  }
});

app.use(cors());
app.use(express.json());

function broadcast(event: SocketEvent) {
  const message = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

function servicesSnapshot(): ServiceStatus[] {
  return SERVICES.map((name) => {
    const breaker = breakers.get(name)!;
    return {
      name,
      state: breaker.state,
      failureRate: breaker.failureRate(),
      currentLimit: store.getCurrentLimit("acme")
    };
  });
}

function snapshot(): DashboardSnapshot {
  return {
    services: servicesSnapshot(),
    apiKeys: store.listApiKeys(),
    recentLogs: store.recentLogs(),
    forecasts: store.snapshotForecasts(),
    settings: store.getSettings(),
    analytics: store.analytics(),
    rateSeries: store.snapshotSeries(),
    adjustments: store.snapshotAdjustments(),
    incidents: store.snapshotIncidents(),
    chaos: { rampActive: Boolean(rampTimer), incidentActive }
  };
}

async function callDownstream(service: ServiceName) {
  const extraLatency = highLatencyActive && service === incidentService ? 650 : 0;
  await new Promise((resolve) => setTimeout(resolve, 35 + Math.random() * 100 + extraLatency));
  const baseFailure = 0;
  const chaosFailure = incidentActive && service === incidentService ? 0.72 : 0;
  return Math.random() > baseFailure + chaosFailure;
}

async function gatewayRequest(apiKey: string, service: ServiceName, details?: { endpoint?: string; method?: string; ip?: string }) {
  const startedAt = Date.now();
  const endpoint = details?.endpoint ?? `/${service}`;
  const method = details?.method ?? "GET";
  const ip = details?.ip ?? "127.0.0.1";
  const client = apiKey;

  if (!store.isApiKeyAllowed(apiKey)) {
    const entry = store.logRequest({
      apiKey,
      client,
      service,
      endpoint,
      method,
      status: 401,
      latencyMs: Date.now() - startedAt,
      ip
    });
    broadcast({ type: "request-log", payload: entry });
    try {
      requestCounter.inc({ service, status: "401" }, 1);
      requestDuration.observe({ service, status: "401" }, (Date.now() - startedAt) / 1000);
    } catch {}
    return { status: 401, body: { error: "API key disabled or unauthorized" } };
  }

  const limiter = store.consumeToken(apiKey);
  if (!limiter.allowed) {
    const entry = store.logRequest({
      apiKey,
      client,
      service,
      endpoint,
      method,
      status: 429,
      latencyMs: Date.now() - startedAt,
      ip
    });
    broadcast({ type: "request-log", payload: entry });
    try {
      requestCounter.inc({ service, status: "429" }, 1);
      requestDuration.observe({ service, status: "429" }, (Date.now() - startedAt) / 1000);
    } catch {}
    return { status: 429, body: { error: "Rate limit exceeded", limit: limiter.capacity } };
  }

  const breaker = breakers.get(service)!;
  if (!breaker.canRequest()) {
    const entry = store.logRequest({
      apiKey,
      client,
      service,
      endpoint,
      method,
      status: 503,
      latencyMs: Date.now() - startedAt,
      ip
    });
    broadcast({ type: "request-log", payload: entry });
    try {
      requestCounter.inc({ service, status: "503" }, 1);
      requestDuration.observe({ service, status: "503" }, (Date.now() - startedAt) / 1000);
    } catch {}
    return { status: 503, body: { error: "Circuit open", service } };
  }

  const success = await callDownstream(service);
  breaker.recordResult(success);
  const status = success ? 200 : 502;
  const entry = store.logRequest({
    apiKey,
    client,
    service,
    endpoint,
    method,
    status,
    latencyMs: Date.now() - startedAt,
    ip
  });
  broadcast({ type: "request-log", payload: entry });

  try {
    requestCounter.inc({ service, status: String(status) }, 1);
    requestDuration.observe({ service, status: String(status) }, (Date.now() - startedAt) / 1000);
  } catch {}

  if (!success && incidentActive) {
    maybeCreateIncident(apiKey, service, breaker.failureRate());
    return { status: 502, body: { error: "Downstream failure", service } };
  }

  if (!success) {
    return { status: 502, body: { error: "Downstream failure", service } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      service,
      client: apiKey,
      traceId: crypto.randomUUID(),
      remainingEstimate: Math.round(limiter.tokens)
    }
  };
}

const incidentCooldowns = new Map<string, number>();

function maybeCreateIncident(apiKey: string, service: ServiceName, failureRate: number) {
  const key = `${apiKey}:${service}`;
  if (failureRate < 0.45 || Date.now() < (incidentCooldowns.get(key) ?? 0)) return;

  incidentCooldowns.set(key, Date.now() + 30_000);
  const incident: Incident = {
    id: crypto.randomUUID(),
    apiKey,
    service,
    failureRate,
    timestamp: Date.now(),
    explanation: "",
    streaming: true
  };

  store.addIncident(incident);
  broadcast({ type: "incident", payload: incident });

  void explainIncident(incident).then((explanation) =>
    streamText(explanation, (token, done) => {
      store.updateIncidentText(incident.id, token, done);
      broadcast({ type: "incident-token", id: incident.id, token, done });
    })
  );
}

app.get("/api/snapshot", (_req, res) => {
  res.json(snapshot());
});

app.get("/api/keys", (_req, res) => {
  res.json(store.listApiKeys());
});

app.post("/api/keys", (req, res) => {
  const name = String(req.body.name ?? "New Client");
  const role = req.body.role === "admin" ? "admin" : "client";
  const record = store.createApiKey(name, role);
  broadcast({ type: "api-keys", payload: store.listApiKeys() });
  res.status(201).json(record);
});

app.patch("/api/keys/:id", (req, res) => {
  const record = store.updateApiKey(req.params.id, req.body);
  if (!record) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  broadcast({ type: "api-keys", payload: store.listApiKeys() });
  res.json(record);
});

app.delete("/api/keys/:id", (req, res) => {
  const deleted = store.deleteApiKey(req.params.id);
  broadcast({ type: "api-keys", payload: store.listApiKeys() });
  res.status(deleted ? 204 : 404).end();
});

app.get("/api/logs", (req, res) => {
  res.json(
    store.queryLogs({
      q: String(req.query.q ?? ""),
      status: req.query.status ? String(req.query.status) : undefined,
      service: req.query.service ? String(req.query.service) : undefined,
      apiKey: req.query.apiKey ? String(req.query.apiKey) : undefined,
      page: Number(req.query.page ?? 1),
      pageSize: Number(req.query.pageSize ?? 50)
    })
  );
});

app.get("/api/logs.csv", (_req, res) => {
  res.header("content-type", "text/csv");
  res.attachment("gateway-logs.csv");
  res.send(store.csvLogs());
});

app.get("/api/forecasts", (_req, res) => {
  res.json(store.snapshotForecasts());
});

app.get("/api/analytics", (_req, res) => {
  res.json(store.analytics());
});

app.get("/api/settings", (_req, res) => {
  res.json(store.getSettings());
});

app.patch("/api/settings", (req, res) => {
  const settings = store.updateSettings({
    defaultLimit: Number(req.body.defaultLimit ?? store.getSettings().defaultLimit),
    forecastIntervalSeconds: Number(req.body.forecastIntervalSeconds ?? store.getSettings().forecastIntervalSeconds),
    predictionHorizonSeconds: Number(req.body.predictionHorizonSeconds ?? store.getSettings().predictionHorizonSeconds),
    adjustmentThreshold: Number(req.body.adjustmentThreshold ?? store.getSettings().adjustmentThreshold),
    adjustmentRatio: Number(req.body.adjustmentRatio ?? store.getSettings().adjustmentRatio),
    circuitFailureThreshold: Number(req.body.circuitFailureThreshold ?? store.getSettings().circuitFailureThreshold),
    circuitCooldownSeconds: Number(req.body.circuitCooldownSeconds ?? store.getSettings().circuitCooldownSeconds)
  });
  broadcast({ type: "settings", payload: settings });
  res.json(settings);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, websocketClients: wss.clients.size, services: servicesSnapshot() });
});

app.post("/api/reset", (_req, res) => {
  if (rampTimer) clearInterval(rampTimer);
  rampTimer = null;
  rampLevel = 0;
  incidentActive = false;
  highLatencyActive = false;
  incidentCooldowns.clear();
  store.resetDemoData();
  for (const service of SERVICES) {
    breakers.set(service, new CircuitBreaker(service));
  }
  broadcast({ type: "snapshot", payload: snapshot() });
  res.json({ ok: true });
});

app.get("/gateway/:service/*?", async (req, res) => {
  const service = req.params.service as ServiceName;
  if (!SERVICES.includes(service)) {
    res.status(404).json({ error: "Unknown service", services: SERVICES });
    return;
  }

  const apiKey = String(req.header("x-api-key") ?? req.query.apiKey ?? "acme");
  const result = await gatewayRequest(apiKey, service, {
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  broadcast({ type: "services", payload: servicesSnapshot() });
  res.status(result.status).json(result.body);
});

app.post("/chaos/ramp", (req, res) => {
  const apiKey = String(req.body.apiKey ?? "acme");
  const service = String(req.body.service ?? "orders") as ServiceName;
  if (!SERVICES.includes(service)) {
    res.status(400).json({ error: "Unknown service" });
    return;
  }

  if (rampTimer) clearInterval(rampTimer);
  rampLevel = 4;
  rampTimer = setInterval(() => {
    rampLevel = Math.min(rampLevel + 2, 32);
    for (let i = 0; i < rampLevel; i += 1) {
      void gatewayRequest(apiKey, service, { endpoint: `/gateway/${service}/ramp`, method: "GET", ip: "10.0.0.42" });
    }
    broadcast({ type: "services", payload: servicesSnapshot() });
  }, 1000);

  broadcast({ type: "chaos", payload: snapshot().chaos });
  res.json({ ok: true, apiKey, service });
});

app.post("/chaos/stop", (_req, res) => {
  if (rampTimer) clearInterval(rampTimer);
  rampTimer = null;
  rampLevel = 0;
  incidentActive = false;
  highLatencyActive = false;
  broadcast({ type: "chaos", payload: snapshot().chaos });
  res.json({ ok: true });
});

app.post("/chaos/incident", (req, res) => {
  const service = String(req.body.service ?? "orders") as ServiceName;
  if (!SERVICES.includes(service)) {
    res.status(400).json({ error: "Unknown service" });
    return;
  }
  incidentService = service;
  incidentActive = !incidentActive;
  broadcast({ type: "chaos", payload: snapshot().chaos });
  res.json({ ok: true, incidentActive, service });
});

app.post("/chaos/latency", (req, res) => {
  const service = String(req.body.service ?? "orders") as ServiceName;
  if (!SERVICES.includes(service)) {
    res.status(400).json({ error: "Unknown service" });
    return;
  }
  incidentService = service;
  highLatencyActive = !highLatencyActive;
  res.json({ ok: true, highLatencyActive, service });
});

app.post("/chaos/ddos", (req, res) => {
  const apiKey = String(req.body.apiKey ?? "acme");
  const service = String(req.body.service ?? "payments") as ServiceName;
  if (!SERVICES.includes(service)) {
    res.status(400).json({ error: "Unknown service" });
    return;
  }
  for (let i = 0; i < 180; i += 1) {
    void gatewayRequest(apiKey, service, { endpoint: `/gateway/${service}/ddos`, method: "GET", ip: "10.0.0.99" });
  }
  res.json({ ok: true, requests: 180, service, apiKey });
});

app.post("/chaos/pulse", async (req, res) => {
  const apiKey = String(req.body.apiKey ?? CLIENTS[Math.floor(Math.random() * CLIENTS.length)]);
  const service = String(req.body.service ?? SERVICES[Math.floor(Math.random() * SERVICES.length)]) as ServiceName;
  const result = await gatewayRequest(apiKey, service, { endpoint: `/gateway/${service}/pulse`, method: "POST" });
  broadcast({ type: "services", payload: servicesSnapshot() });
  res.status(result.status).json(result.body);
});

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "snapshot", payload: snapshot() } satisfies SocketEvent));
});

const forecaster = new Forecaster(store, broadcast);
let lastForecastAt = 0;
setInterval(() => {
  const intervalMs = store.getSettings().forecastIntervalSeconds * 1000;
  if (Date.now() - lastForecastAt < intervalMs) return;
  lastForecastAt = Date.now();
  forecaster.run();
  broadcast({ type: "snapshot", payload: snapshot() });
}, 1_000);

backgroundTimer = setInterval(() => {
  const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];
  const apiKey = CLIENTS[Math.floor(Math.random() * CLIENTS.length)];
  void gatewayRequest(apiKey, service, { endpoint: `/gateway/${service}/background`, method: "GET" });
}, 1_200);

server.listen(PORT, () => {
  console.log(`Gateway API listening on http://127.0.0.1:${PORT}`);
});
