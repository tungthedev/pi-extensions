import assert from "node:assert/strict";
import test from "node:test";

import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "../shared/toolset-resolver.ts";
import registerDroidContentExtension from "./index.ts";

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
  { name: "Read", description: "droid" },
  { name: "LS", description: "droid" },
  { name: "Grep", description: "droid" },
  { name: "Glob", description: "droid" },
  { name: "Create", description: "droid" },
  { name: "Edit", description: "droid" },
  { name: "ApplyPatch", description: "droid" },
  { name: "AskUser", description: "droid" },
  { name: "TodoWrite", description: "droid" },
  { name: "Execute", description: "droid" },
  { name: "Skill", description: "droid" },
  { name: "WebSearch", description: "web" },
  { name: "WebSummary", description: "web" },
  { name: "FetchUrl", description: "web" },
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
  { name: "fs_search", description: "forge" },
  { name: "patch", description: "forge" },
  { name: "followup", description: "forge" },
  { name: "todos_write", description: "forge" },
  { name: "todos_read", description: "forge" },
  { name: "spawn_agent", description: "subagent" },
  { name: "send_input", description: "subagent" },
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

test("forge mode only includes declared available tools from the shared registry", () => {
  const forgeAvailable = TOOL_INFOS.filter(
    (tool) => tool.name === "write" || tool.name === "shell" || tool.name === "read_file" || tool.name === "WebSearch" || tool.name === "Task" || tool.name === "TaskOutput" || tool.name === "TaskStop" || tool.name === "fs_search" || tool.name === "patch" || tool.name === "followup" || tool.name === "todos_write" || tool.name === "todos_read",
  );

  assert.deepEqual(resolveToolsetToolNames("forge", forgeAvailable), [
    "write",
    "shell",
    "read_file",
    "WebSearch",
    "fs_search",
    "patch",
    "followup",
    "todos_write",
    "todos_read",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});

test("droid mode activates droid tools and hides conflicting builtin and codex tools", () => {
  assert.deepEqual(resolveToolsetToolNames("droid", TOOL_INFOS), [
    "Read",
    "LS",
    "Grep",
    "Glob",
    "Create",
    "Edit",
    "ApplyPatch",
    "AskUser",
    "TodoWrite",
    "Execute",
    "Skill",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);
});
