import assert from "node:assert/strict";
import test from "node:test";

import { buildQuestionsFromParams, executeAskUserRequest } from "./core.ts";

test("buildQuestionsFromParams creates a legacy question definition from question/options", () => {
  const built = buildQuestionsFromParams({
    question: "Pick one",
    options: [
      { label: "A", value: "a", description: "first" },
      { label: "B", value: "b", description: "second" },
    ],
  });

  assert.equal(built.usesLegacyQuestion, true);
  assert.deepEqual(built.questions, [
    {
      id: "question_1",
      header: "Question",
      question: "Pick one",
      options: [
        { label: "A", value: "a", description: "first" },
        { label: "B", value: "b", description: "second" },
      ],
    },
  ]);
});

test("executeAskUserRequest collects a selected answer", async () => {
  const result = await executeAskUserRequest(
    {
      hasUI: true,
      ui: {
        async select() {
          return "B";
        },
      },
    } as never,
    {
      question: "Pick one",
      options: [
        { label: "A", value: "a", description: "first" },
        { label: "B", value: "b", description: "second" },
      ],
      allow_text_input: false,
    },
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.details.interrupted, false);
  assert.match(result.content[0]?.text ?? "", /selected "B" \(value: b\)/);
  assert.deepEqual(result.details.answers.question_1, {
    answers: ["b"],
    label: "B",
    wasCustom: false,
  });
});

test("executeAskUserRequest includes typed answers in tool content", async () => {
  const result = await executeAskUserRequest(
    {
      hasUI: true,
      ui: {
        async input() {
          return "build a dashboard";
        },
      },
    } as never,
    {
      question: "What should I build?",
    },
  );

  assert.equal(result.details.interrupted, false);
  assert.match(result.content[0]?.text ?? "", /typed "build a dashboard"/);
  assert.deepEqual(result.details.answers.question_1, {
    answers: ["build a dashboard", "user_note: build a dashboard"],
    label: "build a dashboard",
    wasCustom: true,
  });
});

test("executeAskUserRequest returns an error result when UI is unavailable", async () => {
  const result = await executeAskUserRequest({ hasUI: false } as never, { question: "Need input" });

  assert.equal(result.isError, true);
  assert.equal(result.details.interrupted, true);
  assert.match(result.content[0]?.text ?? "", /UI is not available/i);
});
