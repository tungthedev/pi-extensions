import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  applyTodoUpdates,
  createEmptyTodoSnapshot,
  formatTodoSummary,
  normalizeTodoContent,
  restoreTodoSnapshot,
  type TodoItem,
  type TodoSnapshot,
  type TodoStatus,
  type TodoUpdate,
  type TodoWriteDetails,
} from "./todo-state.ts";
import { syncTodoUi } from "./todo-widget.ts";

export type RegisterTodoToolsOptions = {
  writeToolName: string;
  readToolName: string;
  writeToolLabel: string;
  readToolLabel: string;
  writeCallLabel: string;
  readCallLabel: string;
  writeDescription: string;
  readDescription: string;
  writePromptSnippet: string;
  writePromptGuidelines: string[];
  readPromptSnippet: string;
  readPromptGuidelines: string[];
  widgetKey: string;
  statusKey: string;
};

type WorkflowState = {
  snapshot: TodoSnapshot;
};

const TODO_STATUS_ICONS: Record<Extract<TodoStatus, "pending" | "in_progress" | "completed">, string> = {
  pending: "󰄱",
  in_progress: "󰄗",
  completed: "󰄵",
};

const TodoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
]);

const TodoWriteItemSchema = Type.Object({
  content: Type.String({ description: "Description of the task to create or update." }),
  status: TodoStatusSchema,
});

function reconstructSnapshot(ctx: ExtensionContext, writeToolName: string): TodoSnapshot {
  const detailsList: TodoWriteDetails[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult") continue;
    if (message.toolName !== writeToolName) continue;
    const details = message.details as TodoWriteDetails | undefined;
    if (details?.action === "todo_write") {
      detailsList.push(details);
    }
  }
  return restoreTodoSnapshot(detailsList);
}

function resetWorkflowState(
  ctx: ExtensionContext,
  state: WorkflowState,
  options: RegisterTodoToolsOptions,
): void {
  state.snapshot = reconstructSnapshot(ctx, options.writeToolName);
  syncTodoUi(ctx, state.snapshot.items, {
    widgetKey: options.widgetKey,
    statusKey: options.statusKey,
  });
}

function buildTodoWriteText(items: TodoItem[]): string {
  const summary = formatTodoSummary(items);
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const hasInProgress = items.some((item) => item.status === "in_progress");

  if (pendingCount === 0 || hasInProgress) {
    return summary;
  }

  const reminder =
    pendingCount === 1
      ? "1 pending todo remains with nothing in progress. Update one task to in_progress next."
      : `${pendingCount} pending todos remain with nothing in progress. Update one task to in_progress next.`;

  return `${summary}\n\n${reminder}`;
}

function updatedTodoItems(snapshot: TodoSnapshot, updates: TodoUpdate[]): TodoItem[] {
  const items: TodoItem[] = [];

  for (const update of updates) {
    if (update.status === "cancelled") continue;

    const content = normalizeTodoContent(update.content);
    if (!content) continue;

    const item = snapshot.items.find((entry) => entry.content === content);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

function renderTodoLine(item: TodoItem, theme: ExtensionContext["ui"]["theme"]): string {
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

export function registerTodoTools(pi: ExtensionAPI, options: RegisterTodoToolsOptions): void {
  const state: WorkflowState = {
    snapshot: createEmptyTodoSnapshot(),
  };

  pi.on("session_start", async (_event, ctx) => {
    resetWorkflowState(ctx, state, options);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetWorkflowState(ctx, state, options);
  });

  pi.on("session_fork", async (_event, ctx) => {
    resetWorkflowState(ctx, state, options);
  });

  pi.on("session_tree", async (_event, ctx) => {
    resetWorkflowState(ctx, state, options);
  });

  pi.registerTool({
    name: options.writeToolName,
    label: options.writeToolLabel,
    description: options.writeDescription,
    promptSnippet: options.writePromptSnippet,
    promptGuidelines: options.writePromptGuidelines,
    parameters: Type.Object({
      todos: Type.Array(TodoWriteItemSchema, {
        description: "Todo items to create or update. Items with status cancelled are removed.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const updates = params.todos as TodoUpdate[];
      state.snapshot = applyTodoUpdates(state.snapshot, updates);
      syncTodoUi(ctx, state.snapshot.items, {
        widgetKey: options.widgetKey,
        statusKey: options.statusKey,
      });

      const details: TodoWriteDetails = {
        action: "todo_write",
        items: [...state.snapshot.items],
        nextId: state.snapshot.nextId,
        updatedItems: updatedTodoItems(state.snapshot, updates),
      };

      return {
        content: [{ type: "text", text: buildTodoWriteText(state.snapshot.items) }],
        details,
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold(options.writeCallLabel)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as TodoWriteDetails | undefined;
      if (!details) {
        return new Text(theme.fg("muted", "todos updated"), 0, 0);
      }

      const items = details.updatedItems ?? [];
      return new Text(
        items.length > 0
          ? items.map((item) => renderTodoLine(item, theme)).join("\n")
          : theme.fg("muted", "All todos completed"),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: options.readToolName,
    label: options.readToolLabel,
    description: options.readDescription,
    promptSnippet: options.readPromptSnippet,
    promptGuidelines: options.readPromptGuidelines,
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      state.snapshot = reconstructSnapshot(ctx, options.writeToolName);
      syncTodoUi(ctx, state.snapshot.items, {
        widgetKey: options.widgetKey,
        statusKey: options.statusKey,
      });
      return {
        content: [{ type: "text", text: formatTodoSummary(state.snapshot.items) }],
        details: { items: [...state.snapshot.items] },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold(options.readCallLabel)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { items?: TodoItem[] } | undefined;
      const items = details?.items ?? [];
      return new Text(
        items.length > 0 ? items.map((item) => renderTodoLine(item, theme)).join("\n") : theme.fg("dim", "No todos"),
        0,
        0,
      );
    },
  });
}
