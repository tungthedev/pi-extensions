import assert from "node:assert/strict";
import test from "node:test";

import { executeAskUserRequest } from "./core.ts";
import { CUSTOM_INPUT_OPTION } from "./types.ts";

test("executeAskUserRequest collects a selected answer from unified questions params", async () => {
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
      questions: [{ question: "Pick one", options: ["A", "B"] }],
    },
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.details.interrupted, false);
  assert.match(result.content[0]?.text ?? "", /selected "B"/);
  assert.deepEqual(result.details.answers.question_1, {
    answers: ["B"],
    label: "B",
    wasCustom: false,
  });
});

test("executeAskUserRequest offers custom input by default for option questions", async () => {
  const seenOptions: string[][] = [];
  const result = await executeAskUserRequest(
    {
      hasUI: true,
      ui: {
        async select(_question: string, options: string[]) {
          seenOptions.push(options);
          return CUSTOM_INPUT_OPTION;
        },
        async input() {
          return "build a dashboard";
        },
      },
    } as never,
    {
      questions: [{ question: "What should I build?", options: ["CLI", "Website"] }],
    },
  );

  assert.equal(result.details.interrupted, false);
  assert.deepEqual(seenOptions, [["CLI", "Website", CUSTOM_INPUT_OPTION]]);
  assert.match(result.content[0]?.text ?? "", /typed "build a dashboard"/);
  assert.deepEqual(result.details.answers.question_1, {
    answers: ["build a dashboard", "user_note: build a dashboard"],
    label: "build a dashboard",
    wasCustom: true,
  });
});

test("executeAskUserRequest uses freeform input when options are omitted", async () => {
  const seenTimeouts: Array<number | undefined> = [];

  const result = await executeAskUserRequest(
    {
      hasUI: true,
      ui: {
        async input(_question: string, _placeholder: string | undefined, options?: { timeout?: number }) {
          seenTimeouts.push(options?.timeout);
          return "freeform answer";
        },
      },
    } as never,
    {
      questions: [{ question: "Anything else?" }],
    },
  );

  assert.equal(result.details.interrupted, false);
  assert.deepEqual(seenTimeouts, [60_000]);
  assert.deepEqual(result.details.answers.question_1, {
    answers: ["freeform answer", "user_note: freeform answer"],
    label: "freeform answer",
    wasCustom: true,
  });
});

test("executeAskUserRequest supports up to four questions and applies the default timeout", async () => {
  const seenTimeouts: Array<number | undefined> = [];
  let callIndex = 0;

  const result = await executeAskUserRequest(
    {
      hasUI: true,
      ui: {
        async select(_question: string, _options: string[], dialogOptions?: { timeout?: number }) {
          seenTimeouts.push(dialogOptions?.timeout);
          callIndex += 1;
          return `Option ${callIndex}`;
        },
      },
    } as never,
    {
      questions: [
        { question: "First?", options: ["Option 1", "Option A"] },
        { question: "Second?", options: ["Option 2", "Option B"] },
        { question: "Third?", options: ["Option 3", "Option C"] },
        { question: "Fourth?", options: ["Option 4", "Option D"] },
      ],
    },
  );

  assert.equal(result.isError, undefined);
  assert.equal(Object.keys(result.details.answers).length, 4);
  assert.deepEqual(seenTimeouts, [60_000, 60_000, 60_000, 60_000]);
});

test("executeAskUserRequest returns an error result when UI is unavailable", async () => {
  const result = await executeAskUserRequest({ hasUI: false } as never, {
    questions: [{ question: "Need input" }],
  });

  assert.equal(result.isError, true);
  assert.equal(result.details.interrupted, true);
  assert.match(result.content[0]?.text ?? "", /UI is not available/i);
});
