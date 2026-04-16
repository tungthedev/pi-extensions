import assert from "node:assert/strict";
import test from "node:test";

import { parseDroidPlanRows } from "./tools/plan-parser.ts";
import { registerDroidPlanTool } from "./tools/plan.ts";

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("buildDroidPlanUpdates rejects malformed lines", () => {
  assert.throws(() => parseDroidPlanRows(`1. task without status`), /invalid todo line/i);
});

test("registerDroidPlanTool registers TodoWrite with shared update_plan rendering and applies updates", async () => {
  let tool: any;
  const handlers = new Map<string, Function[]>();

  registerDroidPlanTool({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  assert.equal(tool.name, "TodoWrite");
  assert.equal(tool.label, "Plan");
  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("session_tree"), true);

  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    strikethrough: (text: string) => `~~${text}~~`,
  };

  assert.deepEqual(trimRenderedLines(tool.renderCall({}, theme).render(80)), ["Update plan"]);

  const ui = {
    theme,
    setStatus() {},
    setWidget() {},
  };

  const result = await tool.execute(
    "call-1",
    {
      todos: `1. [completed] First task that is done
2. [in_progress] Currently working on this
3. [pending] Not started yet`,
    },
    undefined,
    undefined,
    { ui, sessionManager: { getBranch: () => [] } },
  );

  assert.equal(result.details.action, "todos_write");
  assert.match(result.content[0]?.text ?? "", /\[completed\] #1 First task that is done/);
  assert.match(result.content[0]?.text ?? "", /\[in_progress\] #2 Currently working on this/);
  assert.match(result.content[0]?.text ?? "", /\[pending\] #3 Not started yet/);
  assert.deepEqual(trimRenderedLines(tool.renderResult(result, { expanded: false }, theme).render(120)), [
    "All todos completed",
  ]);
});
