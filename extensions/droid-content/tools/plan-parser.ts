import type { TodoUpdate } from "../../todos/index.ts";

const TODO_LINE_RE = /^(?:\d+\.\s*)?\[(pending|in_progress|completed)\]\s+(.+)$/i;

export type DroidPlanRow = {
  status: Extract<TodoUpdate["status"], "pending" | "in_progress" | "completed">;
  content: string;
};

export function parseDroidPlanRows(todosText: string): DroidPlanRow[] {
  const rows: DroidPlanRow[] = [];

  for (const rawLine of todosText.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = TODO_LINE_RE.exec(line);
    if (!match) {
      throw new Error(`Invalid todo line: ${line}`);
    }

    rows.push({
      status: (match[1] ?? "pending").toLowerCase() as DroidPlanRow["status"],
      content: match[2]?.trim() ?? "",
    });
  }

  if (rows.length === 0) {
    throw new Error("TodoWrite requires at least one todo line");
  }

  return rows;
}

export function buildDroidPlanUpdates(rows: DroidPlanRow[]): TodoUpdate[] {
  return rows.map((row) => ({
    status: row.status,
    content: row.content,
  }));
}
