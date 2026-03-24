import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import {
  conciseResult,
  detailLine,
  expandHintLine,
  renderEmptySlot,
  renderLines,
  titleLine,
} from "../renderers/common.ts";
import { shortenText } from "../shared/text.ts";
import {
  PlanItemSchema,
  PLAN_STATUS_KEY,
  PLAN_WIDGET_KEY,
  type UpdatePlanDetails,
  type WorkflowPlanItem,
  type WorkflowPlanStatus,
} from "./types.ts";

const COLLAPSED_PLAN_RADIUS = 2;
const PLAN_TEXT_MAX = 150;
const PLAN_FOCUS_ORDER: WorkflowPlanStatus[] = ["in_progress", "blocked", "pending", "cancelled"];

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

function firstPlanIndexByStatus(
  items: WorkflowPlanItem[],
  statuses: WorkflowPlanStatus[],
): number | undefined {
  for (const status of statuses) {
    const index = items.findIndex((item) => item.status === status);
    if (index !== -1) return index;
  }

  return undefined;
}

function firstPlanItemByStatus(
  items: WorkflowPlanItem[],
  statuses: WorkflowPlanStatus[],
): WorkflowPlanItem | undefined {
  const index = firstPlanIndexByStatus(items, statuses);
  if (index === undefined) return undefined;
  return items[index];
}

function planFocusIndex(items: WorkflowPlanItem[]): number {
  const index = firstPlanIndexByStatus(items, PLAN_FOCUS_ORDER);
  if (index !== undefined) return index;
  return Math.max(0, items.length - 1);
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

function countCompletedItems(items: WorkflowPlanItem[]): number {
  return items.filter((item) => item.status === "completed").length;
}

function updatePlanTitle(details: UpdatePlanDetails): string {
  return details.changeType === "new" ? "New Plan" : "Updated Plan";
}

function widgetDetailText(
  explanation: string | undefined,
  items: WorkflowPlanItem[],
  completed: number,
): string | undefined {
  const isComplete = items.length > 0 && completed === items.length;
  if (isComplete) return "complete";

  const focusItem = firstPlanItemByStatus(items, PLAN_FOCUS_ORDER) ?? items[items.length - 1];
  if (focusItem?.step) {
    return shortenText(focusItem.step, PLAN_TEXT_MAX);
  }

  if (explanation) {
    return shortenText(explanation, PLAN_TEXT_MAX);
  }

  return undefined;
}

function updatePlanSummary(
  changeType: UpdatePlanDetails["changeType"],
  items: WorkflowPlanItem[],
): string {
  if (changeType === "cleared" || items.length === 0) {
    return "Plan cleared";
  }

  const completed = countCompletedItems(items);
  return `Plan updated: ${completed}/${items.length} completed`;
}

function updatePlanChangeType(
  previousPlanLength: number,
  nextPlanLength: number,
): UpdatePlanDetails["changeType"] {
  if (nextPlanLength === 0) return "cleared";
  if (previousPlanLength === 0) return "new";
  return "updated";
}

export function buildUpdatePlanResultLines(
  theme: ExtensionContext["ui"]["theme"],
  details: UpdatePlanDetails,
  expanded: boolean,
): string[] {
  if (details.items.length === 0 || details.changeType === "cleared") {
    return [titleLine(theme, "text", "Plan Cleared")];
  }

  const lines = [titleLine(theme, "text", updatePlanTitle(details))];

  if (details.explanation) {
    lines.push(detailLine(theme, shortenText(details.explanation, PLAN_TEXT_MAX), true));
  }

  const { visible, hiddenCount } = visiblePlanItems(details.items, expanded);
  for (const item of visible) {
    const prefix = theme.fg("dim", "  ");
    const itemText = `${updatePlanStatusIcon(item.status)} ${shortenText(item.step, PLAN_TEXT_MAX)}`;
    lines.push(`${prefix}${theme.fg(updatePlanStatusColor(item.status), itemText)}`);
  }

  if (!expanded && hiddenCount > 0) {
    lines.push(expandHintLine(theme, hiddenCount, "task"));
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

  switch (normalized) {
    case "pending":
    case "in_progress":
    case "completed":
    case "blocked":
    case "cancelled":
      return normalized;
    default:
      return "pending";
  }
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
  const items: WorkflowPlanItem[] = [];

  for (const item of input) {
    const step = (item.step ?? item.description ?? "").trim();
    if (!step) continue;

    items.push({
      id: item.id?.trim() || undefined,
      step,
      status: normalizePlanStatus(item.status),
      note: item.note?.trim() || undefined,
    });
  }

  return items;
}

export function planWidgetLines(
  ctx: ExtensionContext,
  explanation: string | undefined,
  items: WorkflowPlanItem[],
): string[] {
  const { theme } = ctx.ui;
  const completed = countCompletedItems(items);
  const detail = widgetDetailText(explanation, items, completed);

  if (!detail) {
    return [theme.fg("accent", `Plan ${completed}/${items.length}`)];
  }

  return [theme.fg("accent", `Plan ${completed}/${items.length} • ${detail}`)];
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
      const explanation = params.explanation?.trim() || undefined;
      const items = normalizePlanItems(rawItems);
      const changeType = updatePlanChangeType(previousPlanLength, items.length);

      state.setExplanation(explanation);
      state.setPlan(items);
      syncPlanUi(ctx, explanation, items);

      return {
        content: [{ type: "text", text: updatePlanSummary(changeType, items) }],
        details: {
          changeType,
          explanation,
          items,
        } as UpdatePlanDetails,
      };
    },
    renderCall() {
      return renderEmptySlot();
    },
    renderResult(result, options, theme) {
      const details = result.details as UpdatePlanDetails | undefined;
      if (!details) {
        const contentText = result.content[0]?.type === "text" ? result.content[0].text : "";
        return conciseResult("update_plan", shortenText(contentText, PLAN_TEXT_MAX));
      }

      return renderLines(buildUpdatePlanResultLines(theme, details, options.expanded));
    },
  });
}
