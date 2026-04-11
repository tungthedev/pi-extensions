import assert from "node:assert/strict";
import test from "node:test";

import { registerRequestUserInputTool } from "./request-user-input.ts";

function captureTool(): any {
  let tool: any;

  registerRequestUserInputTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  return tool;
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("request_user_input renderCall uses the shared Ask user label without a question suffix", () => {
  const tool = captureTool();

  const rendered = tool.renderCall(
    { questions: [{ question: "What kind of help do you want right now?" }] },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Ask user");
});
