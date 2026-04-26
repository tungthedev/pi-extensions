import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

import { buildSelfShellRenderer } from "../../shared/renderers/tool-renderers.ts";
import {
  applyTodoUpdates,
  createEmptyTodoSnapshot,
  formatTodoSummary,
  normalizeTodoContent,
  renderTodoLines,
  restoreTodoSnapshot,
  type TodoItem,
  type TodoSnapshot,
  type TodoWriteDetails,
} from "../../todos/index.ts";
import { syncTodoUi } from "../../todos/todo-widget.ts";
import { buildDroidPlanUpdates, parseDroidPlanRows, type DroidPlanRow } from "./plan-parser.ts";

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
Call TodoWrite IN PARALLEL with other tools to save time and tokens. When starting work on a task, create/update todos simultaneously with your first exploration tools (read, Grep, LS, etc.). Don't wait to finish reading files before creating your todo list - do both at once. This parallelization significantly improves response time.`;

type DroidPlanWriteDetails = TodoWriteDetails & {
  parsedRows?: DroidPlanRow[];
};

type WorkflowState = {
  snapshot: TodoSnapshot;
  previousParsedRows: DroidPlanRow[];
};

function reconstructState(ctx: ExtensionContext): WorkflowState {
  const detailsList: DroidPlanWriteDetails[] = [];
  let previousParsedRows: DroidPlanRow[] = [];

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult") continue;
    if (message.toolName !== "TodoWrite") continue;
    const details = message.details as DroidPlanWriteDetails | undefined;
    if (details?.action !== "todos_write") continue;
    detailsList.push(details);
    previousParsedRows = details.parsedRows ?? [];
  }

  return {
    snapshot: restoreTodoSnapshot(detailsList),
    previousParsedRows,
  };
}

function mapPlanRowsToSnapshotItems(snapshot: TodoSnapshot, rows: DroidPlanRow[]): Array<TodoItem | undefined> {
  const matchedIds = new Set<string>();

  return rows.map((row) => {
    const content = normalizeTodoContent(row.content);
    const item = snapshot.items.find((candidate) => candidate.content === content && !matchedIds.has(candidate.id));
    if (item) {
      matchedIds.add(item.id);
    }
    return item;
  });
}

function updatedTodoItems(
  snapshot: TodoSnapshot,
  previousParsedRows: DroidPlanRow[],
  currentParsedRows: DroidPlanRow[],
): TodoItem[] {
  const rowItems = mapPlanRowsToSnapshotItems(snapshot, currentParsedRows);
  const changedItems: TodoItem[] = [];

  for (const [index, row] of currentParsedRows.entries()) {
    const previousRow = previousParsedRows[index];
    if (!previousRow || previousRow.status === row.status) continue;

    const item = rowItems[index];
    if (item) {
      changedItems.push(item);
    }
  }

  return changedItems;
}

export function registerDroidPlanTool(pi: ExtensionAPI): void {
  const state: WorkflowState = { snapshot: createEmptyTodoSnapshot(), previousParsedRows: [] };
  const planRenderer = buildSelfShellRenderer({
    stateKey: "droidPlanRenderState",
    renderCall: (_args, theme) => new Text(theme.fg("toolTitle", theme.bold("Update plan")), 0, 0),
    renderResult: (result, _renderOptions, theme) => {
      const details = (result as { details?: DroidPlanWriteDetails }).details;
      const items = details?.updatedItems ?? [];
      if (items.length === 0) {
        return new Text(theme.fg("muted", "All todos completed"), 0, 0);
      }

      return new Text(renderTodoLines(items, theme), 0, 0);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const restoredState = reconstructState(ctx);
    state.snapshot = restoredState.snapshot;
    state.previousParsedRows = restoredState.previousParsedRows;
    syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });
  });

  pi.on("session_tree", async (_event, ctx) => {
    const restoredState = reconstructState(ctx);
    state.snapshot = restoredState.snapshot;
    state.previousParsedRows = restoredState.previousParsedRows;
    syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });
  });

  pi.registerTool({
    name: "TodoWrite",
    label: "Plan",
    description: DROID_PLAN_DESCRIPTION,
    renderShell: "self",
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

      const parsedRows = parseDroidPlanRows(params.todos);
      const updates = buildDroidPlanUpdates(parsedRows);
      state.snapshot = applyTodoUpdates(state.snapshot, updates);
      const changedItems = updatedTodoItems(state.snapshot, state.previousParsedRows, parsedRows);
      state.previousParsedRows = parsedRows;
      syncTodoUi(ctx, state.snapshot.items, { widgetKey: WIDGET_KEY, statusKey: STATUS_KEY });

      const details: DroidPlanWriteDetails = {
        action: "todos_write",
        items: [...state.snapshot.items],
        nextId: state.snapshot.nextId,
        updatedItems: changedItems,
        parsedRows: [...parsedRows],
      };

      return {
        content: [{ type: "text" as const, text: formatTodoSummary(state.snapshot.items) }],
        details,
      };
    },
    renderCall(args, theme, context) {
      return planRenderer.renderCall(args as Record<string, unknown>, theme, context as never);
    },
    renderResult(result, renderOptions, theme, context) {
      return planRenderer.renderResult(result, renderOptions, theme, context as never);
    },
  });
}
