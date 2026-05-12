import assert from "node:assert/strict";
import test from "node:test";

import { initTheme } from "@earendil-works/pi-coding-agent";

import { registerShellExtension } from "./index.js";
import { createShellToolDefinition } from "./tool.js";

function visibleLines(lines: string[]): string[] {
  const ansiSgr = new RegExp(`${String.fromCharCode(27)}\\[[0-9;:]*m`, "g");
  return lines.map((line) => line.replace(ansiSgr, "").trimEnd());
}

test("shell extension registers only shell-owned behavior", () => {
  const tools: string[] = [];
  const events: string[] = [];
  let setActiveToolsCalls = 0;

  registerShellExtension({
    on(event: string) {
      events.push(event);
    },
    registerTool(tool: { name: string }) {
      tools.push(tool.name);
    },
    setActiveTools() {
      setActiveToolsCalls += 1;
    },
  } as never);

  assert.deepEqual(tools, ["shell"]);
  assert.deepEqual(events, []);
  assert.equal(setActiveToolsCalls, 0);
});

test("shell renderer keeps bash-style compact rendering for partial args and results", () => {
  const tool = createShellToolDefinition();
  const theme = initTheme();
  const state = {};

  const partialCall = tool.renderCall(undefined as never, theme, {
    state,
    lastComponent: undefined,
    executionStarted: false,
  });
  assert.deepEqual(visibleLines(partialCall.render(120)), ["$ ..."]);

  const call = tool.renderCall({ command: "printf 'one\\ntwo\\nthree\\nfour\\nfive\\nsix\\n'" }, theme, {
    state,
    lastComponent: partialCall,
    executionStarted: true,
  });
  assert.deepEqual(visibleLines(call.render(120)), ["$ printf 'one\\ntwo\\nthree\\nfour\\nfive\\nsix\\n'"]);

  const result = tool.renderResult(
    {
      content: [{ type: "text", text: "one\ntwo\nthree\nfour\nfive\nsix" }],
      details: {
        command: "printf 'one\\ntwo\\nthree\\nfour\\nfive\\nsix\\n'",
        workdir: process.cwd(),
      },
    },
    { expanded: false, isPartial: false },
    theme,
    {
      state,
      lastComponent: undefined,
      executionStarted: true,
      isError: false,
      showImages: true,
      invalidate() {},
    },
  );

  const rendered = visibleLines(result.render(120));
  assert.equal(rendered.some((line) => line.includes("earlier lines")), true);
  assert.equal(rendered.some((line) => line === "six"), true);
});



test("shell execute keeps public details while renderer receives native bash shape", async () => {
  const tool = createShellToolDefinition();
  const updates: Array<{ content: Array<{ type: "text"; text: string }>; details: unknown }> = [];

  const result = await tool.execute(
    "call-1",
    { command: "printf 'ok\\n'", workdir: process.cwd() },
    undefined,
    (update) => updates.push(update),
    { cwd: process.cwd() },
  );

  assert.equal(result.content[0]?.text, "ok\n");
  assert.equal(result.details.exitCode, 0);
  assert.equal(result.details.truncation, undefined);
  assert.equal(result.details.fullOutputPath, undefined);
  assert.deepEqual(updates.at(0), { content: [], details: undefined });
  assert.equal(updates.every((update) => !("isError" in update)), true);

  await assert.rejects(
    () =>
      tool.execute(
        "call-2",
        { command: "printf 'bad\\n'; exit 7", workdir: process.cwd() },
        undefined,
        undefined,
        { cwd: process.cwd() },
      ),
    /bad\n+\nCommand exited with code 7/,
  );
});
