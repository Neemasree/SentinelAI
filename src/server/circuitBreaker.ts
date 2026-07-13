import type { CircuitState } from "../shared/types";

export class CircuitBreaker {
  public state: CircuitState = "closed";
  public openedAt: number | null = null;
  private requests: Array<{ timestamp: number; success: boolean }> = [];

  constructor(
    public readonly serviceName: string,
    private options = {
      failureThreshold: 0.5,
      windowMs: 10_000,
      cooldownMs: 15_000
    }
  ) {}

  updateOptions(failureThreshold: number, cooldownSeconds: number) {
    this.options = { ...this.options, failureThreshold, cooldownMs: cooldownSeconds * 1000 };
  }

  recordResult(success: boolean) {
    const now = Date.now();
    this.requests.push({ timestamp: now, success });
    this.requests = this.requests.filter((r) => now - r.timestamp < this.options.windowMs);

    if (this.state === "closed") {
      const rate = this.failureRate();
      if (this.requests.length >= 5 && rate >= this.options.failureThreshold) {
        this.state = "open";
        this.openedAt = now;
      }
    } else if (this.state === "half-open") {
      this.state = success ? "closed" : "open";
      if (this.state === "open") {
        this.openedAt = now;
      }
    }
  }

  canRequest() {
    if (this.state === "closed") return true;
    if (this.state === "open" && this.openedAt && Date.now() - this.openedAt > this.options.cooldownMs) {
      this.state = "half-open";
      return true;
    }
    return false;
  }

  failureRate() {
    if (this.requests.length === 0) return 0;
    return this.requests.filter((r) => !r.success).length / this.requests.length;
  }
}
