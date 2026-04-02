import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  applyForgeTodoUpdates,
  createEmptyForgeTodoSnapshot,
  formatForgeTodoSummary,
  restoreForgeTodoSnapshot,
  type ForgeTodoItem,
  type ForgeTodoSnapshot,
  type ForgeTodoStatus,
  type ForgeTodoUpdate,
  type ForgeTodoWriteDetails,
} from "./todo-state.ts";
import { syncForgeTodoUi } from "./todo-widget.ts";

type WorkflowState = {
  snapshot: ForgeTodoSnapshot;
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

function reconstructSnapshot(ctx: ExtensionContext): ForgeTodoSnapshot {
  const detailsList: ForgeTodoWriteDetails[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "toolResult") continue;
    if (message.toolName !== "todo_write") continue;
    const details = message.details as ForgeTodoWriteDetails | undefined;
    if (details?.action === "todo_write") {
      detailsList.push(details);
    }
  }
  return restoreForgeTodoSnapshot(detailsList);
}

function resetWorkflowState(ctx: ExtensionContext, state: WorkflowState): void {
  state.snapshot = reconstructSnapshot(ctx);
  syncForgeTodoUi(ctx, state.snapshot.items);
}

function buildTodoReadText(items: ForgeTodoItem[]): string {
  return formatForgeTodoSummary(items);
}

function statusBadge(status: ForgeTodoStatus): string {
  switch (status) {
    case "pending":
      return "pending";
    case "in_progress":
      return "in progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
  }
}

export function registerForgeTodoTools(pi: ExtensionAPI): void {
  const state: WorkflowState = {
    snapshot: createEmptyForgeTodoSnapshot(),
  };

  pi.on("session_start", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  pi.on("session_fork", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  pi.on("session_tree", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  pi.registerTool({
    name: "todo_write",
    label: "todo_write",
    description:
      "Create or update structured session todo items. Use this frequently for multi-step tasks so progress stays visible.",
    promptSnippet: "Track multi-step work with structured todo items",
    promptGuidelines: [
      "Use todo_write for non-trivial tasks to keep progress visible.",
      "Prefer at most one in_progress todo item at a time.",
    ],
    parameters: Type.Object({
      todos: Type.Array(TodoWriteItemSchema, {
        description: "Todo items to create or update. Items with status cancelled are removed.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const updates = params.todos as ForgeTodoUpdate[];
      state.snapshot = applyForgeTodoUpdates(state.snapshot, updates);
      syncForgeTodoUi(ctx, state.snapshot.items);

      const details: ForgeTodoWriteDetails = {
        action: "todo_write",
        items: [...state.snapshot.items],
        nextId: state.snapshot.nextId,
      };

      return {
        content: [{ type: "text", text: buildTodoReadText(state.snapshot.items) }],
        details,
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("todo_write ")) +
          theme.fg("muted", `${args.todos.length} update${args.todos.length === 1 ? "" : "s"}`),
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as ForgeTodoWriteDetails | undefined;
      if (!details) {
        return new Text(theme.fg("muted", "todos updated"), 0, 0);
      }

      if (!expanded) {
        return new Text(theme.fg("muted", `${details.items.length} todo item(s)`), 0, 0);
      }

      return new Text(
        details.items.length > 0
          ? details.items
              .map((item) => `${theme.fg("accent", `#${item.id}`)} ${theme.fg("muted", item.content)} ${theme.fg("dim", `(${statusBadge(item.status)})`)}`)
              .join("\n")
          : theme.fg("dim", "No todos"),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "todo_read",
    label: "todo_read",
    description: "Read the current session todo list and progress state.",
    promptSnippet: "Read the current todo list",
    promptGuidelines: ["Use todo_read before large todo updates when you need to inspect current state."],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      state.snapshot = reconstructSnapshot(ctx);
      syncForgeTodoUi(ctx, state.snapshot.items);
      return {
        content: [{ type: "text", text: buildTodoReadText(state.snapshot.items) }],
        details: { items: [...state.snapshot.items] },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as { items?: ForgeTodoItem[] } | undefined;
      const items = details?.items ?? [];
      if (!expanded) {
        return new Text(
          items.length > 0 ? theme.fg("muted", `${items.length} todo item(s)`) : theme.fg("dim", "No todos"),
          0,
          0,
        );
      }
      return new Text(
        items.length > 0
          ? items
              .map((item) => `${theme.fg("accent", `#${item.id}`)} ${theme.fg("muted", item.content)} ${theme.fg("dim", `(${statusBadge(item.status)})`)}`)
              .join("\n")
          : theme.fg("dim", "No todos"),
        0,
        0,
      );
    },
  });

}
