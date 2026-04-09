import assert from "node:assert/strict";
import test from "node:test";

import { buildDroidAskUserQuestions } from "./tools/ask-user-parser.ts";
import { registerDroidAskUserTool } from "./tools/ask-user.ts";

test("buildDroidAskUserQuestions parses one questionnaire block", () => {
  const parsed = buildDroidAskUserQuestions(`1. [question] Which features do you want?
[topic] Features
[option] Auth handling
[option] Login page`);

  assert.deepEqual(parsed, [
    {
      id: "question_1",
      header: "Features",
      question: "Which features do you want?",
      options: [
        { label: "Auth handling", value: "Auth handling" },
        { label: "Login page", value: "Login page" },
      ],
    },
  ]);
});

test("buildDroidAskUserQuestions parses multiple questions and normalizes topics", () => {
  const parsed = buildDroidAskUserQuestions(`1. [question] Which library should we use?
[topic] Date Library
[option] dayjs
[option] date-fns

2. [question] Which mode do you prefer?
[topic] Display Mode
[option] Compact
[option] Detailed`);

  assert.deepEqual(parsed, [
    {
      id: "question_1",
      header: "Date-Library",
      question: "Which library should we use?",
      options: [
        { label: "dayjs", value: "dayjs" },
        { label: "date-fns", value: "date-fns" },
      ],
    },
    {
      id: "question_2",
      header: "Display-Mode",
      question: "Which mode do you prefer?",
      options: [
        { label: "Compact", value: "Compact" },
        { label: "Detailed", value: "Detailed" },
      ],
    },
  ]);
});

test("buildDroidAskUserQuestions rejects malformed questionnaire", () => {
  assert.throws(
    () => buildDroidAskUserQuestions(`1. [question] Missing options\n[topic] Broken`),
    /at least 2 options/i,
  );
});

test("registerDroidAskUserTool registers AskUser with Droid label and delegates to UI flow", async () => {
  let tool: any;

  registerDroidAskUserTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  assert.equal(tool.name, "AskUser");
  assert.equal(tool.label, "Ask User");

  const result = await tool.execute(
    "tool-1",
    {
      questionnaire: `1. [question] Which features do you want?\n[topic] Features\n[option] Auth handling\n[option] Login page`,
    },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        async select() {
          return "Login page";
        },
      },
    },
  );

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /selected "Login page"/i);
  assert.equal(result.details.questions[0]?.header, "Features");
});
