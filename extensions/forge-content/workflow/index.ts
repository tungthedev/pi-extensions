import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerTodoTools } from "../../todos/index.ts";

export function registerForgeWorkflow(pi: ExtensionAPI): void {
  registerTodoTools(pi, {
    writeToolName: "todos_write",
    readToolName: "todos_read",
    writeToolLabel: "todos_write",
    readToolLabel: "todos_read",
    writeCallLabel: "Update todo",
    readCallLabel: "Read todo",
    writeDescription:
      "Create or update structured session todo items. Use this frequently for multi-step tasks so progress stays visible.",
    readDescription: "Read the current session todo list and progress state.",
    writePromptSnippet: "Track multi-step work with structured todo items",
    writePromptGuidelines: [
      "Use todos_write for non-trivial tasks to keep progress visible.",
      "Prefer at most one in_progress todo item at a time.",
    ],
    readPromptSnippet: "Read the current todo list",
    readPromptGuidelines: ["Use todos_read before large todo updates when you need to inspect current state."],
    widgetKey: "forge-content:todos",
    statusKey: "forge-content:todos",
  });
}
