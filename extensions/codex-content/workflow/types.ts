import { Type } from "@sinclair/typebox";

export {
  CUSTOM_INPUT_OPTION,
  RequestOptionObjectSchema,
  RequestOptionSchema,
  RequestQuestionSchema,
  type AskUserParams,
  type RequestAnswer,
  type RequestOption,
  type RequestQuestion,
  type RequestUserInputDetails,
} from "../../ask-user/types.ts";

export const CODEX_WORKFLOW_TOOL_NAMES = ["update_plan", "request_user_input"] as const;

export const PLAN_WIDGET_KEY = "codex-content:plan";
export const PLAN_STATUS_KEY = "codex-content:plan";

export const PlanItemSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "Optional stable identifier for the step." })),
  step: Type.Optional(Type.String({ description: "Human-readable step text." })),
  description: Type.Optional(Type.String({ description: "Alias for step text." })),
  status: Type.Optional(
    Type.String({ description: "Status such as pending, in_progress, or completed." }),
  ),
  note: Type.Optional(Type.String({ description: "Optional short note for this step." })),
});

export type WorkflowPlanStatus = "pending" | "in_progress" | "completed" | "blocked" | "cancelled";

export type WorkflowPlanItem = {
  id?: string;
  step: string;
  status: WorkflowPlanStatus;
  note?: string;
};

export type UpdatePlanDetails = {
  changeType?: "new" | "updated" | "cleared";
  explanation?: string;
  items: WorkflowPlanItem[];
};
