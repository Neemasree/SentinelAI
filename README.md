# SentinelAI: Predictive Self-Healing API Gateway

SentinelAI is an interview-ready API gateway and observability console that predicts traffic spikes before they become outages. It combines dynamic rate limiting, circuit breaking, live WebSocket telemetry, forecast overlays, chaos testing, and AI-style incident explanations in one full-stack TypeScript app.

## Why This Project Stands Out

Most gateway demos stop at reactive controls: rate limits, logs, and circuit breakers. SentinelAI adds a predictive layer. The gateway watches recent request-rate trends, forecasts short-term load with linear regression, and temporarily tightens client limits before predicted traffic crosses the risk threshold.

The result is a demo that shows distributed systems thinking, observability, real-time UX, API design, and applied forecasting without needing heavyweight ML infrastructure.

## Features

- Express API gateway with per-client API key identification
- Dynamic token-bucket rate limiter with temporary predictive limit overrides
- Circuit breaker state machine for downstream services
- Request logging with method, endpoint, service, status, latency, client, and IP
- Forecast engine that runs on an interval and predicts near-future request volume
- Live React dashboard powered by WebSockets
- Recharts traffic visualization with actual and forecast lines
- Predictive adjustment feed with streamed plain-English explanations
- Incident feed for downstream failures and circuit breaker events
- API key management page with create, enable/disable, delete, usage, limits, and token state
- Searchable logs page with CSV export
- Prediction history with confidence scores
- Chaos Lab for traffic spike, DDoS burst, downstream crash, high latency, and recovery demos
- Settings page for runtime gateway and forecasting thresholds
- Analytics page with request, status, service, and client summaries
- Optional Claude API integration for explanation text, with offline deterministic fallback

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Frontend | React, TypeScript, Vite |
| Realtime | WebSockets (`ws`) |
| Charts | Recharts |
| Icons | Lucide React |
| Forecasting | Custom moving-window rate bucketing + linear regression |
| AI explanations | Optional Anthropic Claude API |
| Demo storage | In-memory Redis/Postgres-style store interfaces |

## Architecture

```text
Client requests
  -> Express Gateway
      -> API key auth
      -> Token bucket rate limiter
      -> Circuit breaker
      -> Dummy downstream service
      -> Request logger
      -> Forecast engine
      -> Predictive limit override
      -> Explanation generator
      -> WebSocket broadcast
      -> React dashboard
```

The app currently uses in-memory stores so it runs instantly during interviews. The storage boundary lives in `src/server/stores.ts`, which is the natural place to swap in Redis for token buckets and PostgreSQL for logs, forecasts, adjustments, and incidents.

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Run Frontend and Backend

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Backend API:

```text
http://127.0.0.1:4000/
```

## Environment Variables

Copy `.env.example` if you want to configure the server:

```bash
PORT=4000
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

Claude is optional. Without `ANTHROPIC_API_KEY`, SentinelAI still streams deterministic SRE-style explanations so the demo works offline.

## Demo Flow

1. Open the dashboard and click **Reset demo** for a clean state.
2. Visit **API Keys** and show clients, token state, limits, and usage.
3. Visit **Overview** and show service health plus actual vs forecast traffic.
4. Open **Chaos Lab** and click **Traffic Spike**.
5. Watch the forecast line rise before the incident feed changes.
6. Show the predictive adjustment that lowers the client limit before overload.
7. Click **Crash Service** to trigger real downstream failures.
8. Show circuit breaker behavior and the incident explanation feed.
9. Visit **Logs** and filter/export request history.
10. Visit **Analytics** to show request totals, error counts, and service distribution.

## Useful Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/snapshot` | Full dashboard state |
| `GET` | `/api/health` | Backend and service health |
| `GET` | `/gateway/:service/*` | Proxy request through gateway controls |
| `GET` | `/api/keys` | List API keys |
| `POST` | `/api/keys` | Create API key |
| `PATCH` | `/api/keys/:id` | Edit API key metadata/status |
| `DELETE` | `/api/keys/:id` | Delete API key |
| `GET` | `/api/logs` | Search/paginate request logs |
| `GET` | `/api/logs.csv` | Export request logs |
| `GET` | `/api/forecasts` | Forecast history |
| `GET` | `/api/analytics` | Analytics summary |
| `PATCH` | `/api/settings` | Update runtime thresholds |
| `POST` | `/api/reset` | Reset demo state |
| `POST` | `/chaos/ramp` | Start synthetic traffic spike |
| `POST` | `/chaos/ddos` | Fire burst traffic |
| `POST` | `/chaos/incident` | Toggle downstream failure mode |
| `POST` | `/chaos/latency` | Toggle high latency mode |
| `POST` | `/chaos/stop` | Stop chaos modes |

## Project Structure

```text
src/
  client/
    App.tsx          React console and pages
    main.tsx         Vite entry
    styles.css       Dashboard styling
  server/
    circuitBreaker.ts
    explanation.ts
    forecaster.ts
    index.ts         Express + WebSocket server
    stores.ts        In-memory Redis/Postgres-style store
  shared/
    types.ts         Shared frontend/backend types
```

## Scripts

```bash
npm run dev        # run backend and frontend together
npm run dev:server # backend only
npm run dev:client # frontend only
npm run build      # typecheck and production build
npm run typecheck  # TypeScript check
npm start          # run backend with tsx
```

## Production Upgrade Path

- Replace token bucket maps with Redis hashes and expiring limit override keys.
- Persist request logs, forecast records, adjustments, incidents, and API keys in PostgreSQL.
- Add JWT login and RBAC for dashboard users.
- Add Prometheus metrics and Grafana dashboards.
- Split frontend routes with lazy loading if bundle size matters.
- Add unit tests for rate limiting, circuit breaker transitions, and forecast decisions.


## License

MIT
