import type { LiveChildAttachment, RpcResponse } from "./types.ts";

import { RPC_COMMAND_TIMEOUT_MS } from "./types.ts";

export function parseJsonLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  const lines = parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  return { lines, rest };
}

function writeJsonLine(attachment: LiveChildAttachment, payload: Record<string, unknown>): void {
  if (attachment.process.stdin.destroyed) {
    throw new Error(`Agent ${attachment.agentId} is not accepting input`);
  }
  attachment.process.stdin.write(`${JSON.stringify(payload)}\n`);
}

export function rejectPendingResponses(attachment: LiveChildAttachment, error: Error): void {
  const pending = [...attachment.pendingResponses.values()];
  attachment.pendingResponses.clear();
  for (const entry of pending) {
    entry.reject(error);
  }
}

export async function sendRpcCommand(
  attachment: LiveChildAttachment,
  command: Record<string, unknown>,
  timeoutMs = RPC_COMMAND_TIMEOUT_MS,
): Promise<RpcResponse> {
  const id = `${attachment.agentId}:${attachment.nextCommandId}`;
  attachment.nextCommandId += 1;

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      attachment.pendingResponses.delete(id);
      reject(new Error(`Timed out waiting for RPC response from agent ${attachment.agentId}`));
    }, timeoutMs);

    attachment.pendingResponses.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    try {
      writeJsonLine(attachment, { ...command, id });
    } catch (error) {
      clearTimeout(timer);
      attachment.pendingResponses.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function respondToUiRequest(
  attachment: LiveChildAttachment,
  message: Record<string, unknown>,
): void {
  const requestId = typeof message.id === "string" ? message.id : undefined;
  const method = typeof message.method === "string" ? message.method : undefined;
  if (!requestId || !method) return;

  try {
    if (method === "confirm") {
      writeJsonLine(attachment, {
        type: "extension_ui_response",
        id: requestId,
        confirmed: false,
      });
      return;
    }

    if (method === "select" || method === "input" || method === "editor") {
      writeJsonLine(attachment, {
        type: "extension_ui_response",
        id: requestId,
        cancelled: true,
      });
    }
  } catch {
    // Ignore UI auto-cancel failures; the process exit/error path will capture anything serious.
  }
}
