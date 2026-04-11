import { muxSetupHint } from "./interactive.ts";

export const MIN_WAIT_AGENT_TIMEOUT_MS = 30_000;
export const DEFAULT_WAIT_AGENT_TIMEOUT_MS = 45_000;
export const MAX_WAIT_AGENT_TIMEOUT_MS = 90_000;

export function muxUnavailableError(kind = "interactive child sessions"): Error {
  return new Error(`${kind} require a supported terminal multiplexer. ${muxSetupHint()}`);
}

export function normalizeWaitAgentTimeoutMs(timeoutMs: number | undefined): number {
  const rawTimeoutMs = timeoutMs ?? DEFAULT_WAIT_AGENT_TIMEOUT_MS;
  if (rawTimeoutMs <= 0) {
    throw new Error("timeout_ms must be greater than zero");
  }
  return Math.min(MAX_WAIT_AGENT_TIMEOUT_MS, Math.max(MIN_WAIT_AGENT_TIMEOUT_MS, rawTimeoutMs));
}

export function getWaitAgentResultTitle(timedOut: boolean, agentCount: number): string {
  if (timedOut && agentCount === 0) {
    return "Waiting timed out";
  }

  return agentCount === 1 ? "Agent finished" : "Agents finished";
}
