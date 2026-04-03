import { Type } from "@sinclair/typebox";

export const CUSTOM_INPUT_OPTION = "Other (type a custom answer)";

export const RequestOptionObjectSchema = Type.Object({
  label: Type.String({ description: "User-facing label (1-5 words)." }),
  value: Type.Optional(Type.String({ description: "Structured value returned when selected." })),
  description: Type.String({
    description: "One short sentence explaining impact/tradeoff if selected.",
  }),
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

export type RequestOptionInput = string | { label: string; value?: string; description?: string };

export type RequestQuestionInput = {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; value?: string; description?: string }>;
};

export type AskUserParams = {
  questions?: RequestQuestionInput[];
  question?: string;
  prompt?: string;
  options?: RequestOptionInput[];
  allow_text_input?: boolean;
  placeholder?: string;
  multi_line?: boolean;
  default_value?: string;
  timeout_ms?: number;
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

export type RequestAnswer = {
  answers: string[];
  label?: string;
  wasCustom?: boolean;
  cancelled?: boolean;
};

export type RequestUserInputDetails = {
  questions: RequestQuestion[];
  answers: Record<string, RequestAnswer>;
  interrupted: boolean;
};
