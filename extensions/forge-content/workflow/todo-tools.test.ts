import assert from "node:assert/strict";
import test from "node:test";

import { registerForgeTodoTools } from "./todo-tools.ts";

test("registerForgeTodoTools does not register /forge-todos", () => {
  const commands: string[] = [];

  registerForgeTodoTools({
    on() {},
    registerTool() {},
    registerCommand(name: string) {
      commands.push(name);
    },
  } as never);

  assert.deepEqual(commands, []);
});
