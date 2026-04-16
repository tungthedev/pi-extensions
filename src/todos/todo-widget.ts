import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { countTodoProgress, type TodoItem } from "./todo-state.ts";

export function syncTodoUi(
  ctx: ExtensionContext,
  items: TodoItem[],
  options: {
    widgetKey: string;
    statusKey: string;
  },
): void {
  ctx.ui.setStatus(options.statusKey, undefined);

  const inProgressItem = items.find((item) => item.status === "in_progress");
  if (!inProgressItem) {
    ctx.ui.setWidget(options.widgetKey, undefined, { placement: "aboveEditor" });
    return;
  }

  const progress = countTodoProgress(items);
  ctx.ui.setWidget(
    options.widgetKey,
    [ctx.ui.theme.fg("accent", `Todos [${progress.completed}/${progress.total}]: ${inProgressItem.content}`)],
    { placement: "aboveEditor" },
  );
}
