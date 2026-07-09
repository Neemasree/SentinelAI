// Auth Types
export type UserRole = "ADMIN" | "DEVELOPER" | "VIEWER";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AuthResponse = {
  token: string;
  user: UserRecord;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  name: string;
};

// Gateway Types
export type CircuitState = "closed" | "open" | "half-open";

export type ServiceName = "orders" | "billing" | "inventory" | "users" | "payments";

export type RatePoint = {
  t: number;
  rate: number;
  forecast?: number;
  adjusted?: boolean;
  confidence?: number;
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  key: string;
  role: "admin" | "client";
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  usageCount: number;
  currentLimit: number;
  remainingTokens: number;
};

export type RequestLog = {
  id: string;
  timestamp: number;
  apiKey: string;
  client: string;
  service: ServiceName;
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  ip: string;
};

export type ForecastRecord = {
  id: string;
  timestamp: number;
  apiKey: string;
  service: ServiceName;
  currentRate: number;
  predictedRate: number;
  confidence: number;
  limitChanged: boolean;
};

export type GatewaySettings = {
  defaultLimit: number;
  forecastIntervalSeconds: number;
  predictionHorizonSeconds: number;
  adjustmentThreshold: number;
  adjustmentRatio: number;
  circuitFailureThreshold: number;
  circuitCooldownSeconds: number;
};

export type PredictiveAdjustment = {
  id: string;
  apiKey: string;
  service: ServiceName;
  oldLimit: number;
  newLimit: number;
  predictedRate: number;
  slope: number;
  timestamp: number;
  explanation: string;
  streaming: boolean;
};

export type Incident = {
  id: string;
  service: ServiceName;
  apiKey: string;
  failureRate: number;
  timestamp: number;
  explanation: string;
  streaming: boolean;
};

export type ServiceStatus = {
  name: ServiceName;
  state: CircuitState;
  failureRate: number;
  currentLimit: number;
};

export type AnalyticsSummary = {
  totalRequests: number;
  successRate: number;
  rateLimited: number;
  downstreamErrors: number;
  peakService: ServiceName;
  topClient: string;
  byService: Array<{ service: ServiceName; requests: number; errors: number }>;
  byStatus: Array<{ status: number; count: number }>;
  peakHours: Array<{ label: string; requests: number }>;
};

export type DashboardSnapshot = {
  services: ServiceStatus[];
  apiKeys: ApiKeyRecord[];
  recentLogs: RequestLog[];
  forecasts: ForecastRecord[];
  settings: GatewaySettings;
  analytics: AnalyticsSummary;
  rateSeries: Record<string, RatePoint[]>;
  adjustments: PredictiveAdjustment[];
  incidents: Incident[];
  chaos: {
    rampActive: boolean;
    incidentActive: boolean;
  };
};

export type SocketEvent =
  | { type: "snapshot"; payload: DashboardSnapshot }
  | { type: "rate-point"; key: string; point: RatePoint }
  | { type: "services"; payload: ServiceStatus[] }
  | { type: "api-keys"; payload: ApiKeyRecord[] }
  | { type: "request-log"; payload: RequestLog }
  | { type: "forecast"; payload: ForecastRecord }
  | { type: "settings"; payload: GatewaySettings }
  | { type: "adjustment"; payload: PredictiveAdjustment }
  | { type: "adjustment-token"; id: string; token: string; done?: boolean }
  | { type: "incident"; payload: Incident }
  | { type: "incident-token"; id: string; token: string; done?: boolean }
  | { type: "chaos"; payload: DashboardSnapshot["chaos"] };
