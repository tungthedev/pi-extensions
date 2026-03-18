import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

export function withCodexArgs<TDetails>(
  result: AgentToolResult<TDetails>,
  args: Record<string, unknown>,
): AgentToolResult<TDetails & { __codexArgs: Record<string, unknown> }> {
  const details =
    result.details && typeof result.details === "object"
      ? (result.details as Record<string, unknown>)
      : {};

  return {
    ...result,
    details: {
      ...details,
      __codexArgs: args,
    } as TDetails & { __codexArgs: Record<string, unknown> },
  };
}

export function codexArgs(result: AgentToolResult<unknown>): Record<string, unknown> {
  const details = result.details as { __codexArgs?: Record<string, unknown> } | undefined;
  return details?.__codexArgs ?? {};
}
