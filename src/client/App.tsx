import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Download,
  Flame,
  Gauge,
  KeyRound,
  LayoutDashboard,
  RadioTower,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Zap
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type {
  AnalyticsSummary,
  ApiKeyRecord,
  DashboardSnapshot,
  ForecastRecord,
  GatewaySettings,
  Incident,
  PredictiveAdjustment,
  RatePoint,
  RequestLog,
  ServiceName,
  SocketEvent
} from "../shared/types";
import { useAuth } from "./AuthContext";

type Page = "overview" | "keys" | "logs" | "predictions" | "incidents" | "chaos" | "settings" | "analytics";

const emptyAnalytics: AnalyticsSummary = {
  totalRequests: 0,
  successRate: 1,
  rateLimited: 0,
  downstreamErrors: 0,
  peakService: "orders",
  topClient: "none",
  byService: [],
  byStatus: [],
  peakHours: []
};

const emptySettings: GatewaySettings = {
  defaultLimit: 70,
  forecastIntervalSeconds: 5,
  predictionHorizonSeconds: 30,
  adjustmentThreshold: 0.8,
  adjustmentRatio: 0.7,
  circuitFailureThreshold: 0.5,
  circuitCooldownSeconds: 15
};

const emptySnapshot: DashboardSnapshot = {
  services: [],
  apiKeys: [],
  recentLogs: [],
  forecasts: [],
  settings: emptySettings,
  analytics: emptyAnalytics,
  rateSeries: {},
  adjustments: [],
  incidents: [],
  chaos: { rampActive: false, incidentActive: false }
};

const navItems: Array<{ page: Page; label: string; icon: ReactNode }> = [
  { page: "overview", label: "Overview", icon: <LayoutDashboard size={18} /> },
  { page: "keys", label: "API Keys", icon: <KeyRound size={18} /> },
  { page: "logs", label: "Logs", icon: <Database size={18} /> },
  { page: "predictions", label: "Prediction", icon: <Gauge size={18} /> },
  { page: "incidents", label: "Incidents", icon: <AlertTriangle size={18} /> },
  { page: "chaos", label: "Chaos Lab", icon: <Flame size={18} /> },
  { page: "settings", label: "Settings", icon: <Settings size={18} /> },
  { page: "analytics", label: "Analytics", icon: <BarChart3 size={18} /> }
];

const stateLabel = {
  closed: "Healthy",
  "half-open": "Testing",
  open: "Open"
};

export function App() {
  const { token, user } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptySnapshot);
  const [page, setPage] = useState<Page>("overview");
  const [selectedService, setSelectedService] = useState<ServiceName>("orders");
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    fetch("/api/snapshot", { headers: authHeaders(token) })
      .then((res) => res.json())
      .then(setSnapshot)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.hostname}:4000`;
    
    // Add token to WebSocket connection if available
    const socket = token 
      ? new WebSocket(wsUrl, [token])
      : new WebSocket(wsUrl);

    socket.onopen = () => setWsConnected(true);
    socket.onclose = () => setWsConnected(false);
    socket.onerror = () => setWsConnected(false);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SocketEvent;
        setSnapshot((current) => reduceSocketEvent(current, event));
      } catch {}
    };

    return () => socket.close();
  }, [token]);

  const filteredNavItems = useMemo(() => {
    const isAdmin = user?.role === "ADMIN";
    return navItems.filter((item) => {
      if (item.page === "chaos" || item.page === "settings") {
        return isAdmin;
      }
      return true;
    });
  }, [user]);

  useEffect(() => {
    const isAdmin = user?.role === "ADMIN";
    if (user && !isAdmin && (page === "chaos" || page === "settings")) {
      setPage("overview");
    }
  }, [user]);

  const selectedSeries = useMemo(() => {
    const entries = Object.entries(snapshot.rateSeries).filter(([key]) => key.endsWith(`:${selectedService}`));
    return mergeSeries(entries);
  }, [snapshot.rateSeries, selectedService]);

  return (
    <main className="console">
      <aside className="navRail">
        <div className="brand">
          <ShieldCheck size={28} />
          <div>
            <h1>Predictive Gateway</h1>
            <p>Self-healing edge control</p>
          </div>
        </div>
        <nav>
          {filteredNavItems.map((item) => (
            <button className={page === item.page ? "active" : ""} key={item.page} onClick={() => setPage(item.page)} type="button">
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Gateway command center</p>
            <h2>{navItems.find((item) => item.page === page)?.label}</h2>
          </div>
          <div className="topActions">
            {user?.role === "ADMIN" && (
              <button className="ghostButton" onClick={() => postJson("/api/reset", {}, "POST", token)} type="button">
                <Square size={16} />
                Reset demo
              </button>
            )}
            <div className={`livePill ${wsConnected ? "" : "disconnected"}`}>
              <RadioTower size={16} />
              {wsConnected ? "live websocket" : "reconnecting..."}
            </div>
          </div>
        </header>

        {page === "overview" && (
          <OverviewPage snapshot={snapshot} selectedService={selectedService} setSelectedService={setSelectedService} selectedSeries={selectedSeries} />
        )}
        {page === "keys" && <KeysPage token={token} />}
        {page === "logs" && <LogsPage token={token} />}
        {page === "predictions" && <PredictionsPage forecasts={snapshot.forecasts} selectedSeries={selectedSeries} />}
        {page === "incidents" && <IncidentsPage adjustments={snapshot.adjustments} incidents={snapshot.incidents} />}
        {page === "chaos" && <ChaosPage snapshot={snapshot} token={token} />}
        {page === "settings" && <SettingsPage settings={snapshot.settings} token={token} />}
        {page === "analytics" && <AnalyticsPage analytics={snapshot.analytics} />}
      </section>
    </main>
  );
}

function OverviewPage({
  snapshot,
  selectedService,
  setSelectedService,
  selectedSeries
}: {
  snapshot: DashboardSnapshot;
  selectedService: ServiceName;
  setSelectedService: (service: ServiceName) => void;
  selectedSeries: ReturnType<typeof mergeSeries>;
}) {
  const selectedStatus = snapshot.services.find((service) => service.name === selectedService);

  return (
    <div className="pageGrid overviewGrid">
      <section className="serviceStack">
        {snapshot.services.map((service) => (
          <button
            className={`serviceButton ${service.name === selectedService ? "selected" : ""}`}
            key={service.name}
            onClick={() => setSelectedService(service.name)}
            type="button"
          >
            <span className={`stateDot ${service.state}`} />
            <span>
              <strong>{service.name}</strong>
              <small>{stateLabel[service.state]} / {(service.failureRate * 100).toFixed(0)}% failures</small>
            </span>
            <span className="limit">{service.currentLimit}</span>
          </button>
        ))}
      </section>

      <section className="panel chartPanel">
        <PanelTitle eyebrow="Actual vs forecast" title={selectedService} />
        <TrafficChart data={selectedSeries} />
      </section>

      <section className="metricStrip wide">
        <Metric icon={<Activity size={18} />} label="Latest actual" value={`${lastNumber(selectedSeries, "actual").toFixed(1)} req/s`} />
        <Metric icon={<Zap size={18} />} label="30s forecast" value={`${lastNumber(selectedSeries, "forecast").toFixed(1)} req/s`} />
        <Metric icon={<AlertTriangle size={18} />} label="Failure rate" value={`${((selectedStatus?.failureRate ?? 0) * 100).toFixed(0)}%`} />
        <Metric icon={<KeyRound size={18} />} label="API keys" value={String(snapshot.apiKeys.length)} />
      </section>

      <section className="panel feedPreview">
        <PanelTitle eyebrow="AI explanation feed" title="Prevention and recovery" />
        {snapshot.adjustments.length || snapshot.incidents.length ? (
          [...snapshot.adjustments.slice(0, 2), ...snapshot.incidents.slice(0, 2)].map((item) =>
            "oldLimit" in item ? <AdjustmentItem key={item.id} item={item} /> : <IncidentItem key={item.id} item={item} />
          )
        ) : (
          <EmptyFeed text="No AI explanations yet. Trigger Traffic Spike or Crash Service in Chaos Lab." />
        )}
      </section>
    </div>
  );
}

function KeysPage({ token }: { token: string | null }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [name, setName] = useState("New Interview Client");
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyFull, setNewKeyFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void refreshKeys(); }, [token]);

  async function refreshKeys() {
    setLoading(true);
    try {
      const endpoint = isAdmin ? "/api/keys" : "/api-keys";
      const response = await fetch(endpoint, { headers: authHeaders(token) });
      if (response.ok) setKeys((await response.json()) as ApiKeyRecord[]);
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!name.trim()) return;
    const endpoint = isAdmin ? "/api/keys" : "/api-keys";
    const res = await postJson(endpoint, { name: name.trim() }, "POST", token);
    if (res.ok) {
      const created = (await res.json()) as ApiKeyRecord;
      setNewKeyFull(created.key);
    }
    setName("");
    await refreshKeys();
  }

  async function toggleKey(id: string, enabled: boolean) {
    const endpoint = isAdmin ? `/api/keys/${id}` : `/api-keys/${id}`;
    await postJson(endpoint, { enabled: !enabled }, "PATCH", token);
    await refreshKeys();
  }

  async function deleteKey(id: string) {
    const endpoint = isAdmin ? `/api/keys/${id}` : `/api-keys/${id}`;
    await postJson(endpoint, {}, "DELETE", token);
    await refreshKeys();
  }

  return (
    <div className="pageGrid">
      <section className="panel actionRow">
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="API key name" />
        <button className="primaryButton" onClick={() => void createKey()} type="button">
          <KeyRound size={18} />
          Create key
        </button>
      </section>
      {newKeyFull && (
        <section className="panel" style={{ background: "#0d2a1a", border: "1px solid #22c55e", padding: "12px 16px" }}>
          <strong style={{ color: "#22c55e" }}>Copy your key now — it won't be shown again:</strong>
          <code style={{ display: "block", marginTop: 6, wordBreak: "break-all" }}>{newKeyFull}</code>
          <button className="tinyButton" style={{ marginTop: 8 }} onClick={() => setNewKeyFull(null)} type="button">Dismiss</button>
        </section>
      )}
      <section className="panel tablePanel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Role</th>
              <th>Limit</th>
              <th>Tokens</th>
              <th>Usage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>Loading API keys...</td>
              </tr>
            ) : keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td><code>{key.key}</code></td>
                <td>{key.role}</td>
                <td>{key.currentLimit}</td>
                <td>{key.remainingTokens}</td>
                <td>{key.usageCount}</td>
                <td>
                  <button className="tinyButton" onClick={() => void toggleKey(key.id, key.enabled)} type="button">
                    {key.enabled ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td>
                  <button className="tinyButton danger" onClick={() => void deleteKey(key.id)} type="button">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function LogsPage({ token }: { token: string | null }) {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [logQuery, setLogQuery] = useState("");

  useEffect(() => {
    fetch(`/api/logs?q=${encodeURIComponent(logQuery)}&pageSize=100`, { headers: authHeaders(token) })
      .then((r) => r.json())
      .then((data) => setLogs(data.rows ?? []))
      .catch(() => undefined);
  }, [logQuery, token]);

  async function downloadCsv() {
    const res = await fetch("/api/logs.csv", { headers: authHeaders(token) });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gateway-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="pageGrid">
      <section className="panel actionRow">
        <Search size={18} />
        <input placeholder="Search method, status, client, endpoint..." value={logQuery} onChange={(event) => setLogQuery(event.target.value)} />
        <a className="primaryButton" onClick={(e) => { e.preventDefault(); void downloadCsv(); }} href="#">
          <Download size={18} />
          Export CSV
        </a>
      </section>
      <section className="panel tablePanel">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Client</th>
              <th>Method</th>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td>{log.apiKey}</td>
                <td>{log.method}</td>
                <td>{log.endpoint}</td>
                <td><StatusCode status={log.status} /></td>
                <td>{log.latencyMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PredictionsPage({ forecasts, selectedSeries }: { forecasts: ForecastRecord[]; selectedSeries: ReturnType<typeof mergeSeries> }) {
  return (
    <div className="pageGrid splitGrid">
      <section className="panel chartPanel">
        <PanelTitle eyebrow="Forecast overlay" title="Prediction engine" />
        <TrafficChart data={selectedSeries} />
      </section>
      <section className="panel tablePanel">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Client</th>
              <th>Service</th>
              <th>Current</th>
              <th>Predicted</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.slice(0, 24).map((forecast) => (
              <tr key={forecast.id}>
                <td>{new Date(forecast.timestamp).toLocaleTimeString()}</td>
                <td>{forecast.apiKey}</td>
                <td>{forecast.service}</td>
                <td>{forecast.currentRate.toFixed(1)}</td>
                <td>{forecast.predictedRate.toFixed(1)}</td>
                <td>{Math.round(forecast.confidence * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function IncidentsPage({ adjustments, incidents }: { adjustments: PredictiveAdjustment[]; incidents: Incident[] }) {
  return (
    <div className="pageGrid splitGrid">
      <section className="panel feedColumn">
        <PanelTitle eyebrow="Prevented incidents" title="Predictive adjustments" />
        {adjustments.length ? adjustments.map((item) => <AdjustmentItem key={item.id} item={item} />) : <EmptyFeed text="No predictive adjustments yet." />}
      </section>
      <section className="panel feedColumn">
        <PanelTitle eyebrow="Reactive incidents" title="Circuit events" />
        {incidents.length ? incidents.map((item) => <IncidentItem key={item.id} item={item} />) : <EmptyFeed text="No incidents detected." />}
      </section>
    </div>
  );
}

function ChaosPage({ snapshot, token }: { snapshot: DashboardSnapshot; token: string | null }) {
  return (
    <div className="pageGrid">
      <section className="metricStrip">
        <Metric icon={<Flame size={18} />} label="Traffic ramp" value={snapshot.chaos.rampActive ? "active" : "idle"} />
        <Metric icon={<AlertTriangle size={18} />} label="Failure mode" value={snapshot.chaos.incidentActive ? "active" : "idle"} />
        <Metric icon={<Terminal size={18} />} label="Demo client" value="acme" />
      </section>
      <section className="chaosGrid">
        <ChaosButton icon={<Flame />} title="Traffic Spike" text="Ramps synthetic traffic until the forecast line bends." path="/chaos/ramp" token={token} />
        <ChaosButton icon={<Zap />} title="DDoS Burst" text="Fires a short burst to force 429s and log filtering." path="/chaos/ddos" token={token} />
        <ChaosButton icon={<AlertTriangle />} title="Crash Service" text="Toggles downstream failures so the circuit opens." path="/chaos/incident" token={token} />
        <ChaosButton icon={<Gauge />} title="High Latency" text="Adds service latency for latency-heavy logs." path="/chaos/latency" token={token} />
        <ChaosButton icon={<Square />} title="Recover" text="Stops traffic ramp and clears active chaos modes." path="/chaos/stop" token={token} />
      </section>
    </div>
  );
}

function SettingsPage({ settings, token }: { settings: GatewaySettings; token: string | null }) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);

  return (
    <section className="panel settingsGrid">
      {Object.entries(draft).map(([key, value]) => (
        <label key={key}>
          <span>{labelize(key)}</span>
          <input
            type="number"
            step={key.includes("Ratio") || key.includes("Threshold") ? "0.05" : "1"}
            value={value}
            onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <button className="primaryButton" onClick={() => postJson("/api/settings", draft, "PATCH", token)} type="button">
        <Settings size={18} />
        Save settings
      </button>
    </section>
  );
}

function AnalyticsPage({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <div className="pageGrid">
      <section className="metricStrip">
        <Metric icon={<Activity size={18} />} label="Total requests" value={String(analytics.totalRequests)} />
        <Metric icon={<ShieldCheck size={18} />} label="Success rate" value={`${Math.round(analytics.successRate * 100)}%`} />
        <Metric icon={<AlertTriangle size={18} />} label="Rate limited" value={String(analytics.rateLimited)} />
        <Metric icon={<BarChart3 size={18} />} label="Top client" value={analytics.topClient} />
      </section>
      <section className="panel analyticsCharts">
        <MiniBar title="Requests by service" data={analytics.byService} x="service" y="requests" />
        <MiniBar title="Status distribution" data={analytics.byStatus} x="status" y="count" />
      </section>
    </div>
  );
}

function TrafficChart({ data }: { data: ReturnType<typeof mergeSeries> }) {
  return (
    <div className="chartWrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 18, right: 28, bottom: 8, left: 4 }}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={38} />
          <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #263247", borderRadius: 8 }} />
          <Legend />
          <Line dot={false} type="monotone" dataKey="actual" name="Actual req/s" stroke="#f5c542" strokeWidth={3} />
          <Line dot={false} type="monotone" dataKey="forecast" name="Forecast req/s" stroke="#3ddbd9" strokeDasharray="8 7" strokeWidth={3} />
          {data.filter((point) => point.adjusted).map((point) => (
            <ReferenceLine key={point.t} x={point.label} stroke="#7dd3fc" strokeDasharray="3 4" label="adjusted" />
          ))}
          {data.filter((point) => point.adjusted).map((point) => (
            <ReferenceDot key={`${point.t}-dot`} x={point.label} y={point.actual} r={5} fill="#7dd3fc" stroke="none" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniBar({ title, data, x, y }: { title: string; data: Array<Record<string, unknown>>; x: string; y: string }) {
  return (
    <div className="miniChart">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey={x} stroke="#94a3b8" tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #263247", borderRadius: 8 }} />
          <Bar dataKey={y} fill="#3ddbd9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function reduceSocketEvent(current: DashboardSnapshot, event: SocketEvent): DashboardSnapshot {
  if (event.type === "snapshot") return event.payload;
  if (event.type === "services") return { ...current, services: event.payload, analytics: current.analytics };
  if (event.type === "chaos") return { ...current, chaos: event.payload };
  if (event.type === "api-keys") return { ...current, apiKeys: event.payload };
  if (event.type === "settings") return { ...current, settings: event.payload };
  if (event.type === "request-log") {
    const recentLogs = [event.payload, ...current.recentLogs].slice(0, 50);
    return { ...current, recentLogs };
  }
  if (event.type === "forecast") {
    return { ...current, forecasts: [event.payload, ...current.forecasts].slice(0, 500) };
  }
  if (event.type === "rate-point") {
    const nextSeries = [...(current.rateSeries[event.key] ?? []), event.point].slice(-80);
    return { ...current, rateSeries: { ...current.rateSeries, [event.key]: nextSeries } };
  }
  if (event.type === "adjustment") {
    return { ...current, adjustments: [event.payload, ...current.adjustments].slice(0, 50) };
  }
  if (event.type === "incident") {
    return { ...current, incidents: [event.payload, ...current.incidents].slice(0, 50) };
  }
  if (event.type === "adjustment-token") {
    return {
      ...current,
      adjustments: current.adjustments.map((item) =>
        item.id === event.id ? { ...item, explanation: item.explanation + event.token, streaming: !event.done } : item
      )
    };
  }
  if (event.type === "incident-token") {
    return {
      ...current,
      incidents: current.incidents.map((item) =>
        item.id === event.id ? { ...item, explanation: item.explanation + event.token, streaming: !event.done } : item
      )
    };
  }
  return current;
}

function mergeSeries(entries: Array<[string, RatePoint[]]>) {
  const byTime = new Map<number, { t: number; label: string; actual: number; forecast?: number; adjusted?: boolean }>();

  for (const [, points] of entries) {
    for (const point of points) {
      const existing = byTime.get(point.t) ?? {
        t: point.t,
        label: new Date(point.t * 1000).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }),
        actual: 0,
        forecast: undefined,
        adjusted: false
      };
      existing.actual += point.rate;
      existing.forecast = Math.max(existing.forecast ?? 0, point.forecast ?? 0);
      existing.adjusted = existing.adjusted || point.adjusted;
      byTime.set(point.t, existing);
    }
  }

  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

function lastNumber<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const value = items[index][key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="panelTitle">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
    </div>
  );
}

function AdjustmentItem({ item }: { item: PredictiveAdjustment }) {
  return (
    <article className="event predictive">
      <div>
        <strong>{item.apiKey} / {item.service}</strong>
        <small>{new Date(item.timestamp).toLocaleTimeString()} / {item.oldLimit} to {item.newLimit}</small>
      </div>
      <p>{item.explanation}<Cursor show={item.streaming} /></p>
    </article>
  );
}

function IncidentItem({ item }: { item: Incident }) {
  return (
    <article className="event incident">
      <div>
        <strong>{item.apiKey} / {item.service}</strong>
        <small>{new Date(item.timestamp).toLocaleTimeString()} / {(item.failureRate * 100).toFixed(0)}% failures</small>
      </div>
      <p>{item.explanation}<Cursor show={item.streaming} /></p>
    </article>
  );
}

function ChaosButton({ icon, title, text, path, token }: { icon: ReactNode; title: string; text: string; path: string; token: string | null }) {
  return (
    <button className="chaosButton" onClick={() => postJson(path, { service: "orders", apiKey: "acme" }, "POST", token)} type="button">
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </button>
  );
}

function StatusCode({ status }: { status: number }) {
  return <span className={`statusCode ${status < 400 ? "ok" : status === 429 ? "limited" : "bad"}`}>{status}</span>;
}

function EmptyFeed({ text }: { text: string }) {
  return <div className="emptyFeed">{text}</div>;
}

function Cursor({ show }: { show: boolean }) {
  return show ? <span className="cursor" /> : null;
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function authHeaders(token?: string | null) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

const ALLOWED_PATHS = new Set([
  "/api/reset",
  "/api/keys",
  "/api-keys",
  "/api/settings",
  "/chaos/ramp",
  "/chaos/ddos",
  "/chaos/incident",
  "/chaos/latency",
  "/chaos/stop"
]);

function isSafePath(path: string): boolean {
  if (ALLOWED_PATHS.has(path)) return true;
  // allow /api/keys/:id and /api-keys/:id
  if (/^\/api(-keys|\/keys)\/[\w-]+$/.test(path)) return true;
  return false;
}

function postJson(path: string, body: unknown, method = "POST", token?: string | null) {
  if (!isSafePath(path)) throw new Error(`Blocked request to disallowed path: ${path}`);
  return fetch(path, {
    method,
    headers: authHeaders(token),
    body: JSON.stringify(body)
  });
}
