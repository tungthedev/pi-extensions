import assert from "node:assert/strict";
import test from "node:test";

import { renderBashResult } from "./bash.ts";

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-9;]*m/g, "");
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
} as any;

test("renderBashResult shows hidden line counts in collapsed output", () => {
  const component = renderBashResult(
    theme,
    { command: "bun test" },
    {
      content: [
        {
          type: "text",
          text: ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"),
        },
      ],
    } as any,
    false,
  );

  assert.deepEqual(component.render(200).map((line) => stripAnsi(line).trimEnd()), [
    "• Ran bun test",
    "  └ line 1",
    "    line 2",
    "    line 3",
    "    line 4",
    "    line 5",
    "  └ ... +2 more lines (Ctrl+O to expand)",
  ]);
});
