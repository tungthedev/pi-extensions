import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerTodoTools } from "../../todos/index.ts";
import { registerRequestUserInputTool } from "./request-user-input.ts";
import { CODEX_WORKFLOW_TOOL_NAMES } from "./types.ts";

export { CODEX_WORKFLOW_TOOL_NAMES };

export function registerCodexWorkflowTools(pi: ExtensionAPI) {
  registerTodoTools(pi, {
    writeToolName: "update_plan",
    readToolName: "read_plan",
    writeToolLabel: "update_plan",
    readToolLabel: "read_plan",
    writeCallLabel: "Update plan",
    readCallLabel: "Read plan",
    writeDescription: "Create or update structured session todo items for the current plan.",
    readDescription: "Read the current session todo list and progress state.",
    writePromptSnippet: "Track multi-step work with structured todo items",
    writePromptGuidelines: [
      "Use update_plan for non-trivial tasks to keep progress visible.",
      "Prefer at most one in_progress todo item at a time.",
    ],
    readPromptSnippet: "Read the current todo list",
    readPromptGuidelines: ["Use read_plan before large todo updates when you need to inspect current state."],
    widgetKey: "codex-content:plan",
    statusKey: "codex-content:plan",
  });

  registerRequestUserInputTool(pi);
}
