import type { RatePoint, ServiceName, SocketEvent } from "../shared/types";
import { explainPredictiveAdjustment, streamText } from "./explanation";
import { GatewayStore } from "./stores";

type Broadcaster = (event: SocketEvent) => void;

type Trend = {
  slope: number;
  intercept: number;
  predict: (t: number) => number;
};

export function computeTrend(points: RatePoint[]): Trend | null {
  const useful = points.filter((point) => Number.isFinite(point.rate));
  const n = useful.length;
  if (n < 4) return null;

  const meanT = useful.reduce((sum, point) => sum + point.t, 0) / n;
  const meanR = useful.reduce((sum, point) => sum + point.rate, 0) / n;
  let numerator = 0;
  let denominator = 0;

  for (const point of useful) {
    numerator += (point.t - meanT) * (point.rate - meanR);
    denominator += (point.t - meanT) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanR - slope * meanT;
  return { slope, intercept, predict: (t) => Math.max(0, slope * t + intercept) };
}

export class Forecaster {
  private cooldowns = new Map<string, number>();

  constructor(
    private readonly store: GatewayStore,
    private readonly broadcast: Broadcaster
  ) {}

  run() {
    for (const pair of this.store.activePairs()) {
      this.forecastPair(pair.apiKey, pair.service);
    }
  }

  private forecastPair(apiKey: string, service: ServiceName) {
    const key = this.store.seriesKey(apiKey, service);
    const settings = this.store.getSettings();
    const points = this.store.recentRatePoints(apiKey, service);
    const trend = computeTrend(points);
    const nowSeconds = Math.round(Date.now() / 1000);
    const latest = points.at(-1);
    if (!latest) return;

    const confidence = trend ? Math.max(0.45, Math.min(0.98, 1 - Math.abs(trend.slope) * 1.2)) : undefined;
    const forecast = trend?.predict(nowSeconds + settings.predictionHorizonSeconds);
    const point: RatePoint = { t: nowSeconds, rate: latest.rate, forecast, confidence };
    this.store.pushRatePoint(key, point);
    this.broadcast({ type: "rate-point", key, point });

    if (!trend || trend.slope <= 0) return;

    const currentLimit = this.store.getCurrentLimit(apiKey);
    const predictedRate = trend.predict(nowSeconds + settings.predictionHorizonSeconds);
    const predictedWindowLoad = predictedRate * 10;
    const forecastRecord = this.store.addForecast({
      apiKey,
      service,
      currentRate: latest.rate,
      predictedRate,
      confidence: confidence ?? 0.5,
      limitChanged: predictedWindowLoad > currentLimit * settings.adjustmentThreshold
    });
    this.broadcast({ type: "forecast", payload: forecastRecord });

    const cooldownUntil = this.cooldowns.get(key) ?? 0;

    if (Date.now() < cooldownUntil || predictedWindowLoad <= currentLimit * settings.adjustmentThreshold) return;

    const newLimit = Math.max(10, Math.floor(currentLimit * settings.adjustmentRatio));
    this.store.setLimitOverride(apiKey, newLimit, 60_000);
    this.cooldowns.set(key, Date.now() + 25_000);
    this.store.markAdjusted(key, nowSeconds);

    const adjustment = {
      id: crypto.randomUUID(),
      apiKey,
      service,
      oldLimit: currentLimit,
      newLimit,
      predictedRate,
      slope: trend.slope,
      timestamp: Date.now(),
      explanation: "",
      streaming: true
    };

    this.store.addAdjustment(adjustment);
    this.broadcast({ type: "adjustment", payload: adjustment });

    void explainPredictiveAdjustment(adjustment).then((explanation) =>
      streamText(explanation, (token, done) => {
        this.store.updateAdjustmentText(adjustment.id, token, done);
        this.broadcast({ type: "adjustment-token", id: adjustment.id, token, done });
      })
    );
  }
}
