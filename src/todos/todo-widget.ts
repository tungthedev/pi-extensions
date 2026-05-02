import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { TodoItem } from "./todo-state.ts";

import { renderTodoPreviewLine } from "./todo-render.ts";

export function syncTodoUi(
  ctx: ExtensionContext,
  items: TodoItem[],
  options: {
    widgetKey: string;
    statusKey: string;
  },
): void {
  ctx.ui.setStatus(options.statusKey, undefined);

  const inProgressIndex = items.findIndex((item) => item.status === "in_progress");
  if (inProgressIndex === -1) {
    ctx.ui.setWidget(options.widgetKey, undefined, { placement: "aboveEditor" });
    return;
  }

  const inProgressItem = items[inProgressIndex];
  const upcomingPendingItems = items
    .slice(inProgressIndex + 1)
    .filter((item) => item.status === "pending");
  const visiblePendingItems = upcomingPendingItems.slice(0, 2);
  const hiddenPendingCount = upcomingPendingItems.length - visiblePendingItems.length;
  const previewItems = [inProgressItem, ...visiblePendingItems];

  const lines = previewItems.map((item, index) =>
    renderTodoPreviewLine(item, ctx.ui.theme, {
      moreCount: index === previewItems.length - 1 ? hiddenPendingCount : undefined,
    }),
  );

  ctx.ui.setWidget(options.widgetKey, [...lines, ctx.ui.theme.fg("dim", " ")], {
    placement: "aboveEditor",
  });
}
