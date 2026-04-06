import assert from "node:assert/strict";
import test from "node:test";

import registerCodexContentExtension from "./index.ts";
import { syncCodexToolSet } from "./tools/index.ts";

test("codex-content registers before_agent_start for tool and prompt setup", () => {
  const handlers = new Map<string, Function[]>();

  registerCodexContentExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool() {},
    setActiveTools() {},
  } as never);

  assert.equal(handlers.has("before_agent_start"), true);
});

test("syncCodexToolSet restores Pi-style tools when toolSet is pi", () => {
  const allToolNames = [
    "read",
    "grep",
    "find",
    "ls",
    "edit",
    "write",
    "bash",
    "shell",
    "read_file",
    "web_search",
    "update_plan",
    "read_plan",
    "request_user_input",
    "list_dir",
    "find_files",
    "grep_files",
    "apply_patch",
    "view_image",
    "fs_search",
    "patch",
    "followup",
    "todos_write",
    "todos_read",
  ];

  assert.deepEqual(syncCodexToolSet(allToolNames, "pi"), [
    "read",
    "grep",
    "find",
    "ls",
    "edit",
    "write",
    "bash",
    "shell",
    "read_file",
    "web_search",
  ]);
});
