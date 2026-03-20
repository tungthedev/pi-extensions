import assert from "node:assert/strict";
import test from "node:test";

import { isFailedBashResult, renderBashResult } from "./bash.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("isFailedBashResult treats nonzero exit codes as failures", () => {
  assert.equal(
    isFailedBashResult({
      content: [{ type: "text", text: "line 1\nexit code: 1" }],
    } as any),
    true,
  );

  assert.equal(
    isFailedBashResult({
      content: [{ type: "text", text: "line 1\nexit code: 0" }],
    } as any),
    false,
  );
});

test("renderBashResult shows timeout titles clearly", () => {
  const rendered = renderBashResult(
    theme,
    { command: "sleep 10" },
    {
      content: [{ type: "text", text: "Command timed out after 10ms\nexit code: 124" }],
    } as any,
    false,
  );

  const renderedText = (rendered as any).text as string;
  assert.match(renderedText, /Timed out/);
  assert.match(renderedText, /sleep 10/);
});
