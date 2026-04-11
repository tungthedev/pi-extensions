import type { TodoSnapshot, TodoWriteDetails } from "./todo-state.ts";

import { createEmptyTodoSnapshot, restoreTodoSnapshot } from "./store.ts";

export function restoreTodoSnapshotFromHistory(
  entries: Array<{
    type?: string;
    message?: {
      role?: string;
      toolName?: string;
      details?: unknown;
    };
  }>,
  writeToolName: string,
): TodoSnapshot {
  const detailsList: TodoWriteDetails[] = [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message?.role !== "toolResult") continue;
    if (message.toolName !== writeToolName) continue;
    const details = message.details as TodoWriteDetails | undefined;
    if (details?.action === "todos_write") {
      detailsList.push(details);
    }
  }

  return detailsList.length > 0 ? restoreTodoSnapshot(detailsList) : createEmptyTodoSnapshot();
}
