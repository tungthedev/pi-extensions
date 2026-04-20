import assert from "node:assert/strict";
import test from "node:test";

import { initTheme } from "@mariozechner/pi-coding-agent";

import { createShellToolDefinition } from "./tool.ts";

initTheme("one-dark-pro");

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

test("shell uses the original default shell rendering", () => {
  const tool = createShellToolDefinition();
  const state: Record<string, unknown> = {};

  const call = tool.renderCall!(
    { command: "echo hi", timeout_ms: 1000 },
    theme,
    {
      state,
      isPartial: true,
      isError: false,
      lastComponent: undefined,
    } as never,
  );

  assert.equal((tool as { renderShell?: string }).renderShell, undefined);
  assert.equal(typeof call.render, "function");
  assert.equal(call.render(80).length, 1);

  const result = tool.renderResult!(
    {
      content: [{ type: "text", text: "hello" }],
      details: { exitCode: 0 },
    },
    { expanded: false, isPartial: false },
    theme,
    {
      state,
      isPartial: false,
      isError: false,
      args: { command: "echo hi", timeout_ms: 1000 },
      lastComponent: undefined,
    } as never,
  );

  const resultLines = result.render(80);
  assert.ok(resultLines.length >= 1);
  assert.match(resultLines.at(-1) ?? "", /hello/);

  const lines = call.render(80);
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /echo hi/);
  assert.notEqual((lines[0] ?? "").trim().length, 0);
});
