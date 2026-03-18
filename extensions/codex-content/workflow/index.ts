import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { registerUpdatePlanTool, syncPlanUi } from "./plan.ts";
import { registerRequestUserInputTool } from "./request-user-input.ts";
import { CODEX_WORKFLOW_TOOL_NAMES, type WorkflowPlanItem } from "./types.ts";

export { CODEX_WORKFLOW_TOOL_NAMES };

export function registerCodexWorkflowTools(pi: ExtensionAPI) {
  let currentExplanation: string | undefined;
  let currentPlan: WorkflowPlanItem[] = [];

  const resetPlan = (ctx: ExtensionContext) => {
    currentExplanation = undefined;
    currentPlan = [];
    syncPlanUi(ctx, currentExplanation, currentPlan);
  };

  pi.on("session_start", async (_event, ctx) => {
    resetPlan(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetPlan(ctx);
  });

  registerUpdatePlanTool(pi, {
    getExplanation: () => currentExplanation,
    setExplanation: (value) => {
      currentExplanation = value;
    },
    getPlan: () => currentPlan,
    setPlan: (items) => {
      currentPlan = items;
    },
  });
  registerRequestUserInputTool(pi);
}
