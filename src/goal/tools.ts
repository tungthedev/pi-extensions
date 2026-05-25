import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";

import { StringEnum } from "@earendil-works/pi-ai";
import { Container, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import type { GoalEntrySource, GoalResult, ThreadGoal } from "./types.js";

import { buildSelfShellRenderer } from "../shared/renderers/tool-renderers.js";
import { goalToolResponse, toToolText, type GoalToolResponse } from "./format.js";
import { TOOL_PROMPT_GUIDELINES } from "./prompts.js";
import { createGoal } from "./state.js";

const EmptyParams = Type.Object({});
const GOAL_TOOL_ICON = String.fromCodePoint(0x1f3af);

const CreateGoalParams = Type.Object({
  objective: Type.String({
    description:
      "Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.",
  }),
  token_budget: Type.Optional(
    Type.Integer({
      description:
        "Optional positive token budget for the new active goal. Only set this when the user explicitly provides a budget or clearly asks for a budgeted goal.",
      minimum: 1,
    }),
  ),
});

const UpdateGoalParams = Type.Object({
  status: StringEnum(["complete", "blocked"] as const, {
    description:
      "Required. Set to `complete` only when the objective is achieved and no required work remains. Set to `blocked` only after the same blocking condition has recurred for at least three consecutive goal turns and the agent is at an impasse. After a previously blocked goal is resumed, the resumed run starts a fresh blocked audit.",
  }),
});

export interface ToolHost {
  getGoal(): ThreadGoal | null;
  setGoal(goal: ThreadGoal, source: GoalEntrySource, ctx: ExtensionContext): void;
  updateGoal(
    status: "complete" | "blocked",
    source: GoalEntrySource,
    ctx: ExtensionContext,
  ): GoalResult;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return String(Math.round(value));

  const units = ["k", "M", "B"];
  let scaled = value;
  let unitIndex = -1;
  while (Math.abs(scaled) >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  const rendered = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rendered.replace(/\.0$/, "")}${units[unitIndex] ?? ""}`;
}

function emptyResult(): Container {
  return new Container();
}

function goalToolCall(
  theme: Theme,
  text: string,
  color: "toolTitle" | "accent" = "toolTitle",
): Text {
  return new Text(`${theme.fg("toolTitle", GOAL_TOOL_ICON)} ${theme.fg(color, text)}`, 0, 0);
}

function errorResult(result: unknown, theme: Theme): Text | undefined {
  const details = (result as { details?: { error?: unknown } } | undefined)?.details;
  return typeof details?.error === "string" && details.error.length > 0
    ? new Text(theme.fg("error", details.error), 0, 0)
    : undefined;
}

function objectiveFromResult(result: unknown): string | undefined {
  const goal = (result as { details?: { goal?: { objective?: unknown } | null } } | undefined)
    ?.details?.goal;
  return typeof goal?.objective === "string" && goal.objective.trim().length > 0
    ? goal.objective.trim()
    : undefined;
}

function textResult(
  text: string,
  goal: ThreadGoal | null,
  isError = false,
  includeCompletionBudgetReport = false,
): AgentToolResult<GoalToolResponse & { error: string | null }> {
  return {
    content: [{ type: "text", text: isError ? `Error: ${text}` : text }],
    details: {
      ...goalToolResponse(goal, includeCompletionBudgetReport),
      error: isError ? text : null,
    },
  };
}

export function registerGoalTools(pi: ExtensionAPI, host: ToolHost): void {
  const getGoalRenderer = buildSelfShellRenderer({
    stateKey: "goalGetRenderState",
    renderCall: (_args, theme) => goalToolCall(theme, "Read Goal"),
    renderResult: (result, _options, theme) => {
      const error = errorResult(result, theme);
      if (error) return error;
      return new Text(theme.fg("dim", objectiveFromResult(result) ?? "No goal"), 0, 0);
    },
  });
  const createGoalRenderer = buildSelfShellRenderer({
    stateKey: "goalCreateRenderState",
    renderCall: (args, theme) => {
      const objective = typeof args.objective === "string" ? args.objective.trim() : "goal";
      const budget =
        typeof args.token_budget === "number"
          ? theme.fg("muted", ` (${formatCompactNumber(args.token_budget)})`)
          : "";
      return new Text(
        `${theme.fg("toolTitle", GOAL_TOOL_ICON)} ${theme.fg("accent", objective || "goal")}${budget}`,
        0,
        0,
      );
    },
    renderResult: (result, _options, theme) => errorResult(result, theme) ?? emptyResult(),
  });
  const updateGoalRenderer = buildSelfShellRenderer({
    stateKey: "goalUpdateRenderState",
    renderCall: (args, theme) => {
      const status =
        typeof args.status === "string" && args.status.trim().length > 0
          ? args.status.trim()
          : "complete";
      return goalToolCall(theme, `Mark goal ${status}`);
    },
    renderResult: (result, _options, theme) => errorResult(result, theme) ?? emptyResult(),
  });

  pi.registerTool({
    name: "get_goal",
    label: "Get Goal",
    description:
      "Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.",
    promptSnippet:
      "Inspect the current goal, status, token budget, tokens used, and active elapsed time.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    renderShell: "self",
    parameters: EmptyParams,
    async execute() {
      const goal = host.getGoal();
      return textResult(toToolText(goal), goal);
    },
    renderCall(args, theme, context) {
      return getGoalRenderer.renderCall(args as Record<string, unknown>, theme, context as never);
    },
    renderResult(result, options, theme, context) {
      return getGoalRenderer.renderResult(result, options, theme, context as never);
    },
  });

  pi.registerTool({
    name: "create_goal",
    label: "Create Goal",
    description:
      "Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks.",
    promptSnippet:
      "Create one active goal only when explicitly requested and no goal is currently defined.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    renderShell: "self",
    parameters: CreateGoalParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = createGoal(host.getGoal(), params.objective, params.token_budget ?? null);
      if (!result.ok || !result.goal) {
        return textResult(result.message, result.goal, true);
      }
      host.setGoal(result.goal, "tool", ctx);
      return textResult(toToolText(result.goal), result.goal);
    },
    renderCall(args, theme, context) {
      return createGoalRenderer.renderCall(
        args as Record<string, unknown>,
        theme,
        context as never,
      );
    },
    renderResult(result, options, theme, context) {
      return createGoalRenderer.renderResult(result, options, theme, context as never);
    },
  });

  pi.registerTool({
    name: "update_goal",
    label: "Update Goal",
    description:
      "Update the existing goal.\nUse this tool only to mark the goal achieved or genuinely blocked.\nSet status to `complete` only when the objective has actually been achieved and no required work remains.\nSet status to `blocked` only when the same blocking condition has repeated for at least three consecutive goal turns, counting the original/user-triggered turn and any automatic continuations, and the agent cannot make meaningful progress without user input or an external-state change.\nIf the user resumes a goal that was previously marked `blocked`, treat the resumed run as a fresh blocked audit. If the same blocking condition then repeats for at least three consecutive resumed goal turns, set status to `blocked` again.\nOnce the blocked threshold is satisfied, do not keep reporting that you are still blocked while leaving the goal active; set status to `blocked`.\nDo not use `blocked` merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.\nDo not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.\nYou cannot use this tool to pause, resume, budget-limit, or usage-limit a goal; those status changes are controlled by the user or system.\nWhen marking a budgeted goal achieved with status `complete`, report the final token usage from the tool result to the user.",
    promptSnippet:
      "Mark the current goal complete only after an evidence-backed completion audit, or blocked only after the same blocking condition repeats for at least three consecutive goal turns.",
    promptGuidelines: TOOL_PROMPT_GUIDELINES,
    renderShell: "self",
    parameters: UpdateGoalParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = host.updateGoal(params.status, "tool", ctx);
      if (!result.ok || !result.goal) {
        return textResult(result.message, result.goal, true);
      }
      return textResult(toToolText(result.goal, true), result.goal, false, true);
    },
    renderCall(args, theme, context) {
      return updateGoalRenderer.renderCall(
        args as Record<string, unknown>,
        theme,
        context as never,
      );
    },
    renderResult(result, options, theme, context) {
      return updateGoalRenderer.renderResult(result, options, theme, context as never);
    },
  });
}
