import assert from "node:assert/strict";
import test from "node:test";

import { renderEditResult } from "./edit.ts";

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-9;]*m/g, "");
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  inverse: (text: string) => text,
} as any;

test("renderEditResult shows hidden diff line counts in collapsed output", () => {
  const component = renderEditResult(
    theme,
    { path: "/tmp/demo.txt" },
    {
      content: [{ type: "text", text: "Updated /tmp/demo.txt" }],
      details: { diff: "- old\n+ new\n+ newer" },
      isError: false,
    } as any,
    false,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    ["• Edited /tmp/demo.txt (+2 -1)", "  ... +3 more lines (Ctrl+O to expand)"],
  );
});
