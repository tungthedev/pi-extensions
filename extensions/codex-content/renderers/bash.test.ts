import assert from "node:assert/strict";
import test from "node:test";

import { isFailedBashResult, renderBashResult } from "./bash.ts";

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-9;]*m/g, "");
}

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
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

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    [
      "• Ran bun test",
      "└ line 1",
      "  line 2",
      "  line 3",
      "  line 4",
      "  line 5",
      "  ... +2 more lines (Ctrl+O to expand)",
    ],
  );
});

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

test("renderBashResult keeps failed output text and shows the exit code in the header", () => {
  const component = renderBashResult(
    theme,
    { command: "bun test" },
    {
      content: [
        {
          type: "text",
          text: ["line 1", "Command exited with code 7"].join("\n"),
        },
      ],
    } as any,
    false,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    ["• Ran bun test (exit 7)", "└ line 1", "  Command exited with code 7"],
  );
});

test("renderBashResult colors the command red when the bash command fails", () => {
  const colorTheme = {
    fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    inverse: (text: string) => text,
  } as any;

  const component = renderBashResult(
    colorTheme,
    { command: 'rg -n "todo"' },
    {
      content: [{ type: "text", text: "Command exited with code 7" }],
    } as any,
    false,
  );

  assert.match(component.render(200)[0] ?? "", /\[error\]rg -n "todo"\[\/error\]/);
});
