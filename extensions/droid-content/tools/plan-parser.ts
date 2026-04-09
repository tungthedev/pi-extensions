import type { TodoUpdate } from "../../todos/index.ts";

const TODO_LINE_RE = /^(?:\d+\.\s*)?\[(pending|in_progress|completed)\]\s+(.+)$/i;

export function buildDroidPlanUpdates(todosText: string): TodoUpdate[] {
  const updates: TodoUpdate[] = [];

  for (const rawLine of todosText.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = TODO_LINE_RE.exec(line);
    if (!match) {
      throw new Error(`Invalid todo line: ${line}`);
    }

    updates.push({
      status: (match[1] ?? "pending").toLowerCase() as TodoUpdate["status"],
      content: match[2]?.trim() ?? "",
    });
  }

  if (updates.length === 0) {
    throw new Error("TodoWrite requires at least one todo line");
  }

  return updates;
}
