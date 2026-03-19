import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { detailLine, renderLines, titleLine } from "../renderers/common.ts";
import {
  PlanItemSchema,
  PLAN_STATUS_KEY,
  PLAN_WIDGET_KEY,
  type UpdatePlanDetails,
  type WorkflowPlanItem,
  type WorkflowPlanStatus,
} from "./types.ts";

// Re-exported via helper below to keep this file focused on plan logic.
function conciseResult(title: string, detail?: string) {
  return new Text(detail ? `${title} ${detail}` : title, 0, 0);
}

function shorten(value: string, max = 150): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

const COLLAPSED_PLAN_RADIUS = 2;

function updatePlanStatusIcon(status: WorkflowPlanStatus): string {
  switch (status) {
    case "completed":
      return "✔";
    case "in_progress":
      return "◐";
    case "blocked":
      return "⚠";
    case "cancelled":
      return "✕";
    default:
      return "□";
  }
}

function updatePlanStatusColor(
  status: WorkflowPlanStatus,
): "success" | "accent" | "warning" | "dim" | "text" {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "accent";
    case "blocked":
      return "warning";
    case "cancelled":
      return "dim";
    default:
      return "text";
  }
}

function planFocusIndex(items: WorkflowPlanItem[]): number {
  const index =
    items.findIndex((item) => item.status === "in_progress") >= 0
      ? items.findIndex((item) => item.status === "in_progress")
      : items.findIndex((item) => item.status === "blocked") >= 0
        ? items.findIndex((item) => item.status === "blocked")
        : items.findIndex((item) => item.status === "pending") >= 0
          ? items.findIndex((item) => item.status === "pending")
          : items.findIndex((item) => item.status === "cancelled") >= 0
            ? items.findIndex((item) => item.status === "cancelled")
            : items.length - 1;

  return Math.max(0, index);
}

function visiblePlanItems(
  items: WorkflowPlanItem[],
  expanded: boolean,
): {
  visible: WorkflowPlanItem[];
  hiddenCount: number;
} {
  const maxVisible = COLLAPSED_PLAN_RADIUS * 2 + 1;
  if (expanded || items.length <= maxVisible) {
    return { visible: items, hiddenCount: 0 };
  }

  const focusIndex = planFocusIndex(items);
  let start = Math.max(0, focusIndex - COLLAPSED_PLAN_RADIUS);
  let end = Math.min(items.length, focusIndex + COLLAPSED_PLAN_RADIUS + 1);

  if (end - start < maxVisible) {
    if (start === 0) {
      end = Math.min(items.length, maxVisible);
    } else if (end === items.length) {
      start = Math.max(0, items.length - maxVisible);
    }
  }

  const visible = items.slice(start, end);
  return { visible, hiddenCount: items.length - visible.length };
}

export function buildUpdatePlanResultLines(
  theme: ExtensionContext["ui"]["theme"],
  details: UpdatePlanDetails,
  expanded: boolean,
): string[] {
  if (details.items.length === 0 || details.changeType === "cleared") {
    return [titleLine(theme, "text", "Plan Cleared")];
  }

  const title = details.changeType === "new" ? "New Plan" : "Updated Plan";
  const lines = [titleLine(theme, "text", title)];

  if (details.explanation) {
    lines.push(detailLine(theme, shorten(details.explanation), true));
  }

  const { visible, hiddenCount } = visiblePlanItems(details.items, expanded);

  for (const item of visible) {
    const prefix = theme.fg("dim", "  ");
    const text = `${updatePlanStatusIcon(item.status)} ${shorten(item.step)}`;
    lines.push(`${prefix}${theme.fg(updatePlanStatusColor(item.status), text)}`);
  }

  if (!expanded && hiddenCount > 0) {
    lines.push(
      `${theme.fg("dim", "  ")}${theme.fg("muted", `... +${hiddenCount} more tasks (Ctrl+O to expand)`)}`,
    );
  }

  return lines;
}

export function normalizePlanStatus(input?: string): WorkflowPlanStatus {
  const normalized = (input ?? "pending")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (normalized === "done") return "completed";
  if (normalized === "active") return "in_progress";
  if (normalized === "todo") return "pending";
  if (
    normalized === "pending" ||
    normalized === "in_progress" ||
    normalized === "completed" ||
    normalized === "blocked" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }
  return "pending";
}

export function planStatusIcon(status: WorkflowPlanStatus): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    case "blocked":
      return "[!]";
    case "cancelled":
      return "[-]";
    default:
      return "[ ]";
  }
}

export function normalizePlanItems(
  input: Array<{
    id?: string;
    step?: string;
    description?: string;
    status?: string;
    note?: string;
  }>,
): WorkflowPlanItem[] {
  return input
    .map((item) => {
      const step = (item.step ?? item.description ?? "").trim();
      if (!step) return undefined;
      return {
        id: item.id?.trim() || undefined,
        step,
        status: normalizePlanStatus(item.status),
        note: item.note?.trim() || undefined,
      } as WorkflowPlanItem;
    })
    .filter((item): item is WorkflowPlanItem => Boolean(item));
}

export function planWidgetLines(
  ctx: ExtensionContext,
  explanation: string | undefined,
  items: WorkflowPlanItem[],
): string[] {
  const { theme } = ctx.ui;
  const completed = items.filter((item) => item.status === "completed").length;
  const isComplete = items.length > 0 && completed === items.length;

  const focusItem =
    items.find((item) => item.status === "in_progress") ??
    items.find((item) => item.status === "blocked") ??
    items.find((item) => item.status === "pending") ??
    items.find((item) => item.status === "cancelled") ??
    items[items.length - 1];

  const detail = isComplete
    ? "complete"
    : focusItem?.step
      ? shorten(focusItem.step)
      : explanation
        ? shorten(explanation)
        : undefined;

  return [
    theme.fg(
      "accent",
      detail
        ? `Plan ${completed}/${items.length} • ${detail}`
        : `Plan ${completed}/${items.length}`,
    ),
  ];
}

export function syncPlanUi(
  ctx: ExtensionContext,
  explanation: string | undefined,
  items: WorkflowPlanItem[],
): void {
  ctx.ui.setStatus(PLAN_STATUS_KEY, undefined);

  if (items.length === 0) {
    ctx.ui.setWidget(PLAN_WIDGET_KEY, undefined, { placement: "belowEditor" });
    return;
  }

  ctx.ui.setWidget(PLAN_WIDGET_KEY, planWidgetLines(ctx, explanation, items), {
    placement: "belowEditor",
  });
}

export function registerUpdatePlanTool(
  pi: ExtensionAPI,
  state: {
    getExplanation: () => string | undefined;
    setExplanation: (value: string | undefined) => void;
    getPlan: () => WorkflowPlanItem[];
    setPlan: (items: WorkflowPlanItem[]) => void;
  },
): void {
  pi.registerTool({
    name: "update_plan",
    label: "update_plan",
    description:
      "Updates the current working plan with ordered steps, statuses, and an optional explanation.",
    parameters: Type.Object({
      explanation: Type.Optional(
        Type.String({
          description: "Optional short summary of the current plan state.",
        }),
      ),
      plan: Type.Optional(Type.Array(PlanItemSchema, { description: "Ordered plan items." })),
      items: Type.Optional(Type.Array(PlanItemSchema, { description: "Alias for plan items." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const rawItems = params.plan ?? params.items ?? [];
      const previousPlanLength = state.getPlan().length;
      state.setExplanation(params.explanation?.trim() || undefined);
      state.setPlan(normalizePlanItems(rawItems));
      syncPlanUi(ctx, state.getExplanation(), state.getPlan());

      const completed = state.getPlan().filter((item) => item.status === "completed").length;
      const summary =
        state.getPlan().length === 0
          ? "Plan cleared"
          : `Plan updated: ${completed}/${state.getPlan().length} completed`;

      return {
        content: [{ type: "text", text: summary }],
        details: {
          changeType:
            state.getPlan().length === 0 ? "cleared" : previousPlanLength === 0 ? "new" : "updated",
          explanation: state.getExplanation(),
          items: state.getPlan(),
        } as UpdatePlanDetails,
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, _options, theme) {
      const details = result.details as UpdatePlanDetails | undefined;
      if (!details) {
        return conciseResult(
          "update_plan",
          shorten(result.content[0]?.type === "text" ? result.content[0].text : ""),
        );
      }

      return renderLines(buildUpdatePlanResultLines(theme, details, _options.expanded));
    },
  });
}
