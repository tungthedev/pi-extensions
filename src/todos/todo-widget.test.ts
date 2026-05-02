import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import type { TodoItem } from "./todo-state.ts";

import { syncTodoUi } from "./todo-widget.ts";

const theme = {
  fg: (color: string, text: string) => (color === "dim" ? `<dim>${text}</dim>` : text),
} as ExtensionContext["ui"]["theme"];

function todo(id: string, content: string, status: TodoItem["status"]): TodoItem {
  return { id, content, status };
}

test("syncTodoUi leaves a visual spacer line after the todo preview", () => {
  let widgetLines: string[] | undefined;
  const ctx = {
    ui: {
      theme,
      setStatus() {},
      setWidget(_key: string, lines: string[] | undefined) {
        widgetLines = lines;
      },
    },
  } as unknown as ExtensionContext;

  syncTodoUi(ctx, [todo("1", "Current task", "in_progress"), todo("2", "Next task", "pending")], {
    widgetKey: "todos",
    statusKey: "todo-status",
  });

  assert.deepEqual(widgetLines, ["▣ Current task", "□ Next task", "<dim> </dim>"]);
});
