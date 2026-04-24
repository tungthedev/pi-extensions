import { Type } from "typebox";

export const CUSTOM_INPUT_OPTION = "Other (type a custom answer)";

export const RequestOptionSchema = Type.String({
  description: "User-facing option label.",
});

export const RequestQuestionSchema = Type.Object({
  question: Type.String({ description: "Single-sentence prompt shown to the user." }),
  options: Type.Optional(
    Type.Array(RequestOptionSchema, {
      description:
        'Optional list of suggested answers. Omit or pass an empty list for freeform input. Do not include an "Other" option; the client adds custom input automatically.',
    }),
  ),
});

export type RequestQuestionInput = {
  question: string;
  options?: string[];
};

export type AskUserParams = {
  questions: RequestQuestionInput[];
  timeout_ms?: number;
};

export type RequestOption = {
  label: string;
  value: string;
};

export type RequestQuestion = {
  id: string;
  header: string;
  question: string;
  options: RequestOption[];
};

export type RequestQuestionBehavior = {
  useFreeformOnly: boolean;
};

export type NormalizedRequestQuestion = RequestQuestion & {
  behavior: RequestQuestionBehavior;
};

export type NormalizedAskUserRequest = {
  questions: NormalizedRequestQuestion[];
  timeoutMs: number;
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
