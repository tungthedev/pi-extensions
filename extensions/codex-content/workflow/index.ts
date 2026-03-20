import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { registerUpdatePlanTool, syncPlanUi } from "./plan.ts";
import { registerRequestUserInputTool } from "./request-user-input.ts";
import { CODEX_WORKFLOW_TOOL_NAMES, type WorkflowPlanItem } from "./types.ts";

type WorkflowState = {
  explanation?: string;
  plan: WorkflowPlanItem[];
};

export { CODEX_WORKFLOW_TOOL_NAMES };

function createWorkflowState(): WorkflowState {
  return {
    explanation: undefined,
    plan: [],
  };
}

function resetWorkflowState(ctx: ExtensionContext, state: WorkflowState): void {
  state.explanation = undefined;
  state.plan = [];
  syncPlanUi(ctx, state.explanation, state.plan);
}

export function registerCodexWorkflowTools(pi: ExtensionAPI) {
  const state = createWorkflowState();

  pi.on("session_start", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  pi.on("session_switch", async (_event, ctx) => {
    resetWorkflowState(ctx, state);
  });

  registerUpdatePlanTool(pi, {
    getExplanation: () => state.explanation,
    setExplanation: (value) => {
      state.explanation = value;
    },
    getPlan: () => state.plan,
    setPlan: (items) => {
      state.plan = items;
    },
  });

  registerRequestUserInputTool(pi);
}
