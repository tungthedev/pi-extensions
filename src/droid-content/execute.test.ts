import assert from "node:assert/strict";
import test from "node:test";

import { registerDroidExecuteTool } from "./tools/execute.ts";

test("registerDroidExecuteTool registers Execute with Droid label", () => {
  let tool: any;

  registerDroidExecuteTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  assert.equal(tool.name, "Execute");
  assert.equal(tool.label, "Execute");
});

test("Execute runs a foreground shell command", async () => {
  let tool: any;

  registerDroidExecuteTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const result = await tool.execute(
    "tool-1",
    {
      command: "printf 'hello'",
      timeout: 5,
      riskLevelReason: "This command only prints text and does not modify files.",
      riskLevel: "low",
    },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]?.text, "hello");
  assert.equal(result.details.exitCode, 0);
});

test("Execute supports fireAndForget and returns pid plus log path", async () => {
  let tool: any;

  registerDroidExecuteTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const result = await tool.execute(
    "tool-2",
    {
      command: "printf 'hi from bg'",
      timeout: 5,
      riskLevelReason: "This command only prints text and runs in the current project shell.",
      riskLevel: "low",
      fireAndForget: true,
    },
    undefined,
    undefined,
    { cwd: process.cwd() },
  );

  assert.equal(result.isError, undefined);
  assert.match(result.content[0]?.text ?? "", /PID:/);
  assert.match(result.content[0]?.text ?? "", /Log:/);
  assert.equal(typeof result.details.pid, "number");
  assert.equal(typeof result.details.logPath, "string");
});
