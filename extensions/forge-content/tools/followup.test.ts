import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAskUserParamsFromFollowup,
  buildFollowupDetails,
} from "./followup.ts";

test("buildAskUserParamsFromFollowup maps single-choice followups to ask-user params", () => {
  assert.deepEqual(
    buildAskUserParamsFromFollowup({
      question: "Pick one",
      option1: "A",
      option2: "B",
    }),
    {
      question: "Pick one",
      options: ["A", "B"],
      allow_text_input: false,
    },
  );
});

test("buildAskUserParamsFromFollowup maps multi-choice followups to freeform ask-user params", () => {
  assert.deepEqual(
    buildAskUserParamsFromFollowup({
      question: "Pick many",
      multiple: true,
      option1: "A",
      option2: "B",
    }),
    {
      question: "Pick many\nOptions: 1. A  2. B",
    },
  );
});

test("buildFollowupDetails extracts the first answer from ask-user details", () => {
  assert.deepEqual(
    buildFollowupDetails("Pick one", {
      questions: [],
      interrupted: false,
      answers: {
        question_1: {
          answers: ["selected-value"],
          label: "Selected label",
          wasCustom: false,
        },
      },
    }),
    {
      question: "Pick one",
      answer: "Selected label",
      interrupted: false,
    },
  );
});
