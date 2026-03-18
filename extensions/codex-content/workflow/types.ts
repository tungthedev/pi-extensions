import { Type } from "@sinclair/typebox";

export const CODEX_WORKFLOW_TOOL_NAMES = ["update_plan", "request_user_input"] as const;

export const PLAN_WIDGET_KEY = "codex-content:plan";
export const PLAN_STATUS_KEY = "codex-content:plan";
export const CUSTOM_INPUT_OPTION = "Other (type a custom answer)";

export const RequestOptionObjectSchema = Type.Object({
  label: Type.String({ description: "User-facing label (1-5 words)." }),
  value: Type.Optional(Type.String({ description: "Structured value returned when selected." })),
  description: Type.String({ description: "One short sentence explaining impact/tradeoff if selected." }),
});

export const RequestOptionSchema = Type.Union([Type.String(), RequestOptionObjectSchema]);

export const RequestQuestionSchema = Type.Object({
  id: Type.String({ description: "Stable identifier for mapping answers (snake_case)." }),
  header: Type.String({ description: "Short header label shown in the UI (12 or fewer chars)." }),
  question: Type.String({ description: "Single-sentence prompt shown to the user." }),
  options: Type.Array(RequestOptionObjectSchema, {
    description:
      'Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with "(Recommended)". Do not include an "Other" option in this list; the client will add a free-form "Other" option automatically.',
  }),
});

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

export type RequestOption = {
  label: string;
  value: string;
  description?: string;
};

export type RequestQuestion = {
  id: string;
  header: string;
  question: string;
  options: RequestOption[];
};

export type UpdatePlanDetails = {
  changeType?: "new" | "updated" | "cleared";
  explanation?: string;
  items: WorkflowPlanItem[];
};

export type RequestUserInputDetails = {
  questions: RequestQuestion[];
  answers: Record<
    string,
    {
      answers: string[];
      label?: string;
      wasCustom?: boolean;
      cancelled?: boolean;
    }
  >;
  interrupted: boolean;
};
