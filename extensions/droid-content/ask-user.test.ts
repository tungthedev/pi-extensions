import assert from "node:assert/strict";
import test from "node:test";

import { registerDroidAskUserTool } from "./tools/ask-user.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("registerDroidAskUserTool renderCall uses the shared Ask user label without a question suffix", () => {
  let tool: any;

  registerDroidAskUserTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const rendered = tool.renderCall(
    { questions: [{ question: "Which features do you want?" }] },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Ask user");
});

test("registerDroidAskUserTool registers AskUser with Droid label and delegates to the shared ask-user engine", async () => {
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
      questions: [{ question: "Which features do you want?", options: ["Auth handling", "Login page"] }],
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
  assert.equal(result.details.questions[0]?.question, "Which features do you want?");
});
