import assert from "node:assert/strict";
import test from "node:test";

import registerCodexContentExtension from "./index.ts";
import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";

const TOOL_INFOS = resolveRegisteredToolInfos([
  { name: "read", description: "builtin" },
  { name: "grep", description: "builtin" },
  { name: "find", description: "builtin" },
  { name: "ls", description: "builtin" },
  { name: "edit", description: "builtin" },
  { name: "write", description: "builtin" },
  { name: "bash", description: "builtin" },
  { name: "shell", description: "shell" },
  { name: "read_file", description: "read" },
  { name: "WebSearch", description: "web" },
  { name: "WebSummary", description: "web" },
  { name: "FetchUrl", description: "web" },
  { name: "update_plan", description: "codex" },
  { name: "read_plan", description: "codex" },
  { name: "request_user_input", description: "codex" },
  { name: "list_dir", description: "codex" },
  { name: "find_files", description: "codex" },
  { name: "grep_files", description: "codex" },
  { name: "apply_patch", description: "codex" },
  { name: "view_image", description: "codex" },
  { name: "Read", description: "droid" },
  { name: "Task", description: "task" },
  { name: "TaskOutput", description: "task" },
  { name: "TaskStop", description: "task" },
  { name: "spawn_agent", description: "subagent" },
  { name: "send_input", description: "subagent" },
  { name: "wait_agent", description: "subagent" },
  { name: "close_agent", description: "subagent" },
  { name: "fs_search", description: "forge" },
  { name: "patch", description: "forge" },
  { name: "followup", description: "forge" },
  { name: "todos_write", description: "forge" },
  { name: "todos_read", description: "forge" },
]);

test("codex-content registers before_agent_start for shared toolset and prompt setup", () => {
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

test("pi mode excludes codex-managed tools from the shared resolver", () => {
  assert.deepEqual(resolveToolsetToolNames("pi", TOOL_INFOS), [
    "read",
    "grep",
    "find",
    "ls",
    "edit",
    "write",
    "bash",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});

test("codex mode activates codex tool groups and hides conflicting tools", () => {
  assert.deepEqual(resolveToolsetToolNames("codex", TOOL_INFOS), [
    "shell",
    "read_file",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "update_plan",
    "read_plan",
    "request_user_input",
    "list_dir",
    "find_files",
    "grep_files",
    "apply_patch",
    "view_image",
    "spawn_agent",
    "send_input",
    "wait_agent",
    "close_agent",
  ]);
});
