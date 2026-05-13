import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { formatGoalSummary } from "./format.js";
import { continuationPrompt } from "./prompts.js";
import { replaceGoal, updateGoalBudget, updateGoalStatus } from "./state.js";
import { CUSTOM_ENTRY_TYPE, type GoalEntrySource, type ThreadGoal } from "./types.js";

export interface CommandHost {
  getGoal(): ThreadGoal | null;
  setGoal(goal: ThreadGoal, source: GoalEntrySource, ctx: ExtensionCommandContext): void;
  clearGoal(source: GoalEntrySource, ctx: ExtensionCommandContext): void;
}

const COMMANDS = ["pause", "resume", "clear", "budget"] as const;

export type GoalCommandPi = Pick<ExtensionAPI, "registerCommand" | "sendMessage">;

function completions(prefix: string) {
  return COMMANDS.filter((command) => command.startsWith(prefix)).map((command) => ({
    value: command,
    label: command,
    description: `goal ${command}`,
  }));
}

function queueGoalTurn(
  pi: GoalCommandPi,
  goal: ThreadGoal,
  kind: "command_start" | "command_resume",
): void {
  pi.sendMessage(
    {
      customType: CUSTOM_ENTRY_TYPE,
      content: continuationPrompt(goal),
      display: false,
      details: { kind, goalId: goal.goalId },
    },
    { triggerTurn: true, deliverAs: "followUp" },
  );
}

function parseBudgetValue(value: string | undefined): { ok: true; budget: number | null } | { ok: false; message: string } {
  if (value === undefined || !/^\d+$/.test(value)) {
    return { ok: false, message: "Usage: /goal budget N, /goal budget 0, or /goal resume --budget N." };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, message: "Token budget must be a safe integer." };
  }

  return { ok: true, budget: parsed === 0 ? null : parsed };
}

function parseResumeBudget(tokens: string[]): { ok: true; budget?: number | null } | { ok: false; message: string } | null {
  if (tokens[0] !== "resume") return null;
  if (tokens.length === 1) return { ok: true };

  if (tokens.length === 3 && tokens[1] === "--budget") {
    return parseBudgetValue(tokens[2]);
  }

  if (tokens.length === 2 && tokens[1]?.startsWith("--budget=")) {
    return parseBudgetValue(tokens[1].slice("--budget=".length));
  }

  return { ok: false, message: "Usage: /goal resume or /goal resume --budget N." };
}

export async function handleGoalCommand(
  pi: GoalCommandPi,
  host: CommandHost,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const trimmed = args.trim();
  if (trimmed.length === 0) {
    ctx.ui.notify(formatGoalSummary(host.getGoal()));
    return;
  }

  if (trimmed === "clear") {
    const goal = host.getGoal();
    if (!goal) {
      ctx.ui.notify("No goal is set.", "warning");
      return;
    }
    host.clearGoal("command", ctx);
    ctx.ui.notify("Goal cleared.");
    return;
  }

  const tokens = trimmed.split(/\s+/);

  if (tokens[0] === "budget") {
    if (tokens.length !== 2) {
      ctx.ui.notify("Usage: /goal budget N or /goal budget 0.", "warning");
      return;
    }

    const parsed = parseBudgetValue(tokens[1]);
    if (!parsed.ok) {
      ctx.ui.notify(parsed.message, "warning");
      return;
    }

    const result = updateGoalBudget(host.getGoal(), parsed.budget);
    if (!result.ok || !result.goal) {
      ctx.ui.notify(result.message, "warning");
      return;
    }

    host.setGoal(result.goal, "command", ctx);
    ctx.ui.notify(result.message);
    return;
  }

  const resumeBudget = parseResumeBudget(tokens);
  if (trimmed === "pause" || resumeBudget !== null) {
    const current = host.getGoal();
    if (resumeBudget !== null && !resumeBudget.ok) {
      ctx.ui.notify(resumeBudget.message, "warning");
      return;
    }

    let nextGoal = current;
    if (resumeBudget !== null && resumeBudget.budget !== undefined) {
      const budgetResult = updateGoalBudget(current, resumeBudget.budget);
      if (!budgetResult.ok || !budgetResult.goal) {
        ctx.ui.notify(budgetResult.message, "warning");
        return;
      }
      nextGoal = budgetResult.goal;
    }

    const status = trimmed === "pause" ? "paused" : "active";
    const result = updateGoalStatus(nextGoal, status);
    if (!result.ok || !result.goal) {
      ctx.ui.notify(result.message, "warning");
      return;
    }
    host.setGoal(result.goal, "command", ctx);
    ctx.ui.notify(result.message);
    if (resumeBudget !== null && result.goal.status === "active") {
      queueGoalTurn(pi, result.goal, "command_resume");
    }
    return;
  }

  const current = host.getGoal();
  if (current && current.status !== "complete") {
    if (!ctx.hasUI) {
      ctx.ui.notify("Clear the existing goal before replacing it.", "error");
      return;
    }
    const shouldReplace = await ctx.ui.confirm(
      "Replace goal?",
      `Current goal:\n${current.objective}\n\nNew goal:\n${trimmed}`,
    );
    if (!shouldReplace) {
      ctx.ui.notify("Goal unchanged.");
      return;
    }
  }

  const result = replaceGoal(trimmed);
  if (!result.ok || !result.goal) {
    ctx.ui.notify(result.message, "error");
    return;
  }
  host.setGoal(result.goal, "command", ctx);
  ctx.ui.notify(result.message);
  queueGoalTurn(pi, result.goal, "command_start");
}

export function registerGoalCommand(pi: GoalCommandPi, host: CommandHost): void {
  pi.registerCommand("goal", {
    description: "Show or manage the current Codex-style goal.",
    getArgumentCompletions(argumentPrefix) {
      return completions(argumentPrefix.trim());
    },
    async handler(args: string, ctx: ExtensionCommandContext) {
      await handleGoalCommand(pi, host, args, ctx);
    },
  });
}
