import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { TodoItem, TodoStatus } from "./todo-state.ts";

export const TODO_STATUS_ICONS: Record<Extract<TodoStatus, "pending" | "in_progress" | "completed">, string> = {
  pending: "□",
  in_progress: "▣",
  completed: "■",
};

export function renderTodoPreviewLine(
  item: Pick<TodoItem, "content" | "status">,
  theme: ExtensionContext["ui"]["theme"],
  options?: { moreCount?: number },
): string {
  const base = item.status === "in_progress"
    ? theme.fg("accent", `${TODO_STATUS_ICONS.in_progress} ${item.content}`)
    : theme.fg("text", `${TODO_STATUS_ICONS.pending} ${item.content}`);

  if (!options?.moreCount) {
    return base;
  }

  return `${base}${theme.fg("muted", ` (+${options.moreCount} more)`)}`;
}

export function renderTodoLine(item: TodoItem, theme: ExtensionContext["ui"]["theme"]): string {
  if (item.status === "completed") {
    return (
      theme.fg("success", `${TODO_STATUS_ICONS.completed} `) +
      theme.fg("muted", theme.strikethrough(`#${item.id} ${item.content}`))
    );
  }

  if (item.status === "in_progress") {
    return theme.fg("accent", `${TODO_STATUS_ICONS.in_progress} #${item.id} ${item.content}`);
  }

  return theme.fg("text", `${TODO_STATUS_ICONS.pending} #${item.id} ${item.content}`);
}

export function renderTodoLines(items: TodoItem[], theme: ExtensionContext["ui"]["theme"]): string {
  return items.map((item) => renderTodoLine(item, theme)).join("\n");
}
