import assert from "node:assert/strict";
import test from "node:test";

import { initTheme } from "@mariozechner/pi-coding-agent";

import { renderApplyPatchResult } from "./apply-patch.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

function stripAnsi(text: string): string {
  return text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
}

initTheme("dark");

test("renderApplyPatchResult uses a Pi-style heading without the leading bullet", () => {
  const rendered = renderApplyPatchResult(
    theme,
    {
      content: [{ type: "text", text: "Patch applied" }],
      details: {
        exitCode: 0,
        files: [
          {
            action: "modified",
            path: "src/app.ts",
            diff: ["  1 const x = 1", "- 2 const y = 2", "+ 2 const y = 3"].join("\n"),
          },
        ],
      },
    } as any,
    false,
  );

  const renderedText = stripAnsi((rendered as any).text as string);
  assert.match(renderedText, /^Modified src\/app.ts \(\+1 -1\)/);
  assert.doesNotMatch(renderedText, /^•/);
});

test("renderApplyPatchResult shows collapsed preview lines before the expand hint", () => {
  const diffLines = [
    "  1 export function demo() {",
    "- 2   return 1;",
    "+ 2   return 2;",
    "  3 }",
    "  4 ",
    "- 5 console.log('before')",
    "+ 5 console.log('after')",
    "  6 done()",
    "  7 more()",
    "  8 final()",
  ];

  const rendered = renderApplyPatchResult(
    theme,
    {
      content: [{ type: "text", text: "Patch applied" }],
      details: {
        exitCode: 0,
        files: [
          {
            action: "modified",
            path: "src/demo.ts",
            diff: diffLines.join("\n"),
          },
        ],
      },
    } as any,
    false,
  );

  const renderedText = stripAnsi((rendered as any).text as string);
  assert.match(renderedText, /Modified src\/demo.ts/);
  assert.match(renderedText, /return 2;/);
  assert.match(renderedText, /\.\.\. \+2 more lines \(Ctrl\+O to expand\)/);
});
