import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { countForgeTodoProgress, type ForgeTodoItem } from "./todo-state.ts";

const TODO_WIDGET_KEY = "forge-content:todos";
const TODO_STATUS_KEY = "forge-content:todos";

export function syncForgeTodoUi(ctx: ExtensionContext, items: ForgeTodoItem[]): void {
  if (items.length === 0) {
    ctx.ui.setWidget(TODO_WIDGET_KEY, undefined);
    ctx.ui.setStatus(TODO_STATUS_KEY, undefined);
    return;
  }

  const progress = countForgeTodoProgress(items);
  ctx.ui.setStatus(
    TODO_STATUS_KEY,
    ctx.ui.theme.fg("accent", `todos ${progress.completed}/${progress.total}`),
  );

  const lines = items.map((item) => {
    if (item.status === "completed") {
      return (
        ctx.ui.theme.fg("success", "x ") +
        ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(`#${item.id} ${item.content}`))
      );
    }

    if (item.status === "in_progress") {
      return ctx.ui.theme.fg("accent", `> #${item.id} ${item.content}`);
    }

    return `${ctx.ui.theme.fg("dim", "- ")}#${item.id} ${item.content}`;
  });

  ctx.ui.setWidget(TODO_WIDGET_KEY, lines);
}
