import assert from "node:assert/strict";
import test from "node:test";

import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";
import registerDroidContentExtension from "./index.ts";

const TOOL_INFOS = resolveRegisteredToolInfos([
  { name: "read", description: "custom read" },
  { name: "grep", description: "builtin" },
  { name: "find", description: "builtin" },
  { name: "ls", description: "builtin" },
  { name: "edit", description: "builtin" },
  { name: "write", description: "builtin" },
  { name: "bash", description: "builtin" },
  { name: "shell", description: "shell" },
  { name: "LS", description: "droid" },
  { name: "Grep", description: "droid" },
  { name: "Glob", description: "droid" },
  { name: "Create", description: "droid" },
  { name: "Edit", description: "droid" },
  { name: "ApplyPatch", description: "droid" },
  { name: "AskUser", description: "droid" },
  { name: "TodoWrite", description: "droid" },
  { name: "Execute", description: "droid" },
  { name: "WebSearch", description: "web" },
  { name: "WebSummary", description: "web" },
  { name: "FetchUrl", description: "web" },
  { name: "skill", description: "skill" },
  { name: "Task", description: "task" },
  { name: "TaskOutput", description: "task" },
  { name: "TaskStop", description: "task" },
  { name: "update_plan", description: "codex" },
  { name: "read_plan", description: "codex" },
  { name: "request_user_input", description: "codex" },
  { name: "list_dir", description: "codex" },
  { name: "find_files", description: "codex" },
  { name: "grep_files", description: "codex" },
  { name: "apply_patch", description: "codex" },
  { name: "view_image", description: "codex" },
  { name: "spawn_agent", description: "subagent" },
  { name: "send_message", description: "subagent" },
  { name: "wait_agent", description: "subagent" },
  { name: "close_agent", description: "subagent" },
]);

test("droid-content registers before_agent_start for shared toolset setup", () => {
  const handlers = new Map<string, Function[]>();

  registerDroidContentExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool() {},
    setActiveTools() {},
  } as never);

  assert.equal(handlers.has("before_agent_start"), true);
});

test("pi mode keeps builtin tools and excludes droid and codex tool groups", () => {
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
    "skill",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});

test("droid mode activates droid tools and hides conflicting builtin and codex tools", () => {
  assert.deepEqual(resolveToolsetToolNames("droid", TOOL_INFOS), [
    "read",
    "LS",
    "Grep",
    "Glob",
    "Create",
    "Edit",
    "ApplyPatch",
    "AskUser",
    "TodoWrite",
    "Execute",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "skill",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});
