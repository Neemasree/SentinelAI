import type { Incident, PredictiveAdjustment } from "../shared/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function streamText(text: string, onToken: (token: string, done?: boolean) => void) {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  for (const token of tokens) {
    onToken(token);
    await sleep(35);
  }
  onToken("", true);
}

export function predictiveExplanation(adjustment: PredictiveAdjustment) {
  const predicted = adjustment.predictedRate.toFixed(1);
  const slope = adjustment.slope.toFixed(2);
  return `Traffic for ${adjustment.apiKey} on ${adjustment.service} is rising by ${slope} requests per second and is forecast to reach ${predicted} req/s soon. The gateway lowered the temporary limit from ${adjustment.oldLimit} to ${adjustment.newLimit} before errors appeared, keeping headroom while the spike settles.`;
}

export function incidentExplanation(incident: Incident) {
  const failureRate = Math.round(incident.failureRate * 100);
  return `${incident.service} is returning elevated failures for ${incident.apiKey}, with a recent failure rate of ${failureRate}%. The circuit breaker is limiting requests now; check the downstream service health and recent deploys before widening traffic again.`;
}

export async function explainPredictiveAdjustment(adjustment: PredictiveAdjustment) {
  const prompt = `
You are an SRE assistant. A gateway just preemptively lowered a client's rate limit based on a traffic forecast, before any errors occurred.
Explain this decision in 2-3 plain-English sentences for a dashboard audience. Do not speculate beyond the numbers given.

Client: ${adjustment.apiKey}
Service: ${adjustment.service}
Observed trend slope: ${adjustment.slope.toFixed(2)} req/s increase per second
Old limit: ${adjustment.oldLimit} req/window
New limit: ${adjustment.newLimit} req/window
Predicted rate in 30 seconds: ${adjustment.predictedRate.toFixed(1)} req/s
Reason: predicted load was on track to exceed 80% of capacity within the next window
  `.trim();

  return callClaude(prompt, predictiveExplanation(adjustment));
}

export async function explainIncident(incident: Incident) {
  const prompt = `
You are an SRE assistant. A gateway circuit breaker observed elevated downstream errors.
Write a concise incident summary in 2-3 sentences: what changed, which service/client is affected, and one concrete next step. Do not speculate beyond the numbers given.

Client: ${incident.apiKey}
Service: ${incident.service}
Failure rate: ${(incident.failureRate * 100).toFixed(0)}%
  `.trim();

  return callClaude(prompt, incidentExplanation(incident));
}

async function callClaude(prompt: string, fallback: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
        max_tokens: 220,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) return fallback;
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.find((part) => part.type === "text")?.text?.trim() || fallback;
  } catch {
    return fallback;
  }
}
