import type { AgentToolStatus, DurableChildStatus } from "./types.ts";

export function durableStatusToAgentStatus(status: DurableChildStatus): AgentToolStatus {
  return status === "live_running" ? "running" : status === "live_idle" ? "idle" : status;
}

export function normalizeReconstructedStatus(status: DurableChildStatus): DurableChildStatus {
  return status === "live_running" || status === "live_idle" ? "closed" : status;
}

export function deriveDurableStatusFromState(
  data: Record<string, unknown> | undefined,
): DurableChildStatus {
  if (!data) return "live_running";

  const isStreaming = data.isStreaming === true;
  const pendingMessageCount =
    typeof data.pendingMessageCount === "number" ? data.pendingMessageCount : 0;
  return isStreaming || pendingMessageCount > 0 ? "live_running" : "live_idle";
}

export function resolvePostPromptDurableStatus(options: {
  currentStatus: DurableChildStatus;
  state: Record<string, unknown> | undefined;
}): DurableChildStatus {
  if (options.currentStatus !== "live_running") {
    return options.currentStatus;
  }

  const derivedStatus = deriveDurableStatusFromState(options.state);
  return derivedStatus === "live_idle" ? "live_running" : derivedStatus;
}
