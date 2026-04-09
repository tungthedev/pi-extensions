import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  applyTodoUpdates,
  createEmptyTodoSnapshot,
  formatTodoSummary,
  renderTodoLines,
  restoreTodoSnapshot,
  type TodoSnapshot,
  type TodoUpdate,
  type TodoWriteDetails,
} from "../../todos/index.ts";
import { syncTodoUi } from "../../todos/todo-widget.ts";
import { buildDroidPlanUpdates } from "./plan-parser.ts";

const WIDGET_KEY = "droid-content:plan";
const STATUS_KEY = "droid-content:plan";

const DROID_PLAN_DESCRIPTION = `Use this tool to draft and maintain a structured todo list for the current coding session. It helps you organize multi‑step work, make progress visible, and keep the user informed about status and overall advancement.

## Limits
- Maximum 50 todo items
- Maximum 500 characters per todo item

## Input Format
Provide todos as a numbered multi-line string with status markers:

\`\`\`
1. [completed] First task that is done
2. [in_progress] Currently working on this
3. [pending] Not started yet
\`\`\`

Status markers: \`[completed]\`, \`[in_progress]\`, \`[pending]\`
Numbers are for readability only; item order is determined by line position.

## PERFORMANCE TIP
Call TodoWrite IN PARALLEL with other tools to save time and tokens. When starting work on a task, create/update todos simultaneously with your first exploration tools (Read, Grep, LS, etc.). Don't wait to finish reading files before creating your todo list - do both at once. This parallelization significantly improves response time.`;

type WorkflowState = {
  snapshot: TodoSnapshot;
};

function reconstructSnapshot(ctx: ExtensionContext): TodoSnapshot {
  const detailsList: TodoWriteDetails[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult") continue;
    if (message.toolName !== "TodoWrite") continue;
    const details = message.details as TodoWriteDetails | undefined;
    if (details?.action === "todo_write") detailsList.push(details);
  }
  return restoreTodoSnapshot(detailsList);
}

function updatedTodoItems(snapshot: TodoSnapshot, updates: TodoUpdate[]) {
  return updates
    .map((update) => snapshot.items.find((item) => item.content === update.content))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function registerDroidPlanTool(pi: ExtensionAPI): void {
  const state: WorkflowState = { snapshot: createEmptyTodoSnapshot() };

  pi.on("session_start", async (_event, ctx) => {
    state.snapshot = reconstructSnapshot(ctx);
    syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });
  });

  pi.on("session_tree", async (_event, ctx) => {
    state.snapshot = reconstructSnapshot(ctx);
    syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });
  });

  pi.registerTool({
    name: "TodoWrite",
    label: "Plan",
    description: DROID_PLAN_DESCRIPTION,
    parameters: Type.Object({
      todos: Type.Union([
        Type.String({ description: "A string containing todo items, one item per each new line" }),
        Type.Array(Type.Unknown()),
      ]),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (typeof params.todos !== "string") {
        throw new Error("TodoWrite currently supports the documented string todo format only");
      }

      const updates = buildDroidPlanUpdates(params.todos);
      state.snapshot = applyTodoUpdates(state.snapshot, updates);
      syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });

      const details: TodoWriteDetails = {
        action: "todo_write",
        items: [...state.snapshot.items],
        nextId: state.snapshot.nextId,
        updatedItems: updatedTodoItems(state.snapshot, updates),
      };

      return {
        content: [{ type: "text" as const, text: formatTodoSummary(state.snapshot.items) }],
        details,
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("Update plan")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as TodoWriteDetails | undefined;
      const items = details?.updatedItems ?? [];
      if (items.length === 0) {
        return new Text(theme.fg("muted", "All todos completed"), 0, 0);
      }

      return new Text(renderTodoLines(items, theme), 0, 0);
    },
  });
}
