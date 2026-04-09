import assert from "node:assert/strict";
import test from "node:test";

import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "./toolset-resolver.ts";

const ALL_TOOL_INFOS = resolveRegisteredToolInfos([
  { name: "read", description: "builtin read" },
  { name: "grep", description: "builtin grep" },
  { name: "find", description: "builtin find" },
  { name: "ls", description: "builtin ls" },
  { name: "edit", description: "builtin edit" },
  { name: "write", description: "builtin write" },
  { name: "bash", description: "builtin bash" },
  { name: "shell", description: "compat shell" },
  { name: "read_file", description: "compat read" },
  { name: "WebSearch", description: "web search" },
  { name: "WebSummary", description: "web summary" },
  { name: "FetchUrl", description: "fetch" },
  { name: "update_plan", description: "codex" },
  { name: "read_plan", description: "codex" },
  { name: "request_user_input", description: "codex" },
  { name: "list_dir", description: "codex" },
  { name: "find_files", description: "codex" },
  { name: "grep_files", description: "codex" },
  { name: "apply_patch", description: "codex" },
  { name: "view_image", description: "codex" },
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
  { name: "fs_search", description: "forge" },
  { name: "patch", description: "forge" },
  { name: "followup", description: "forge" },
  { name: "todos_write", description: "forge" },
  { name: "todos_read", description: "forge" },
  { name: "spawn_agent", description: "subagent codex" },
  { name: "send_input", description: "subagent codex" },
  { name: "wait_agent", description: "subagent codex" },
  { name: "close_agent", description: "subagent codex" },
  { name: "Task", description: "task" },
  { name: "TaskOutput", description: "task" },
  { name: "TaskStop", description: "task" },
]);

test("resolveToolsetToolNames computes the canonical tool list for each mode", () => {
  assert.deepEqual(resolveToolsetToolNames("pi", ALL_TOOL_INFOS), [
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

  assert.deepEqual(resolveToolsetToolNames("codex", ALL_TOOL_INFOS), [
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

  assert.deepEqual(resolveToolsetToolNames("forge", ALL_TOOL_INFOS), [
    "write",
    "shell",
    "read_file",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "fs_search",
    "patch",
    "followup",
    "todos_write",
    "todos_read",
    "Task",
    "TaskOutput",
    "TaskStop",
  ]);

  assert.deepEqual(resolveToolsetToolNames("droid", ALL_TOOL_INFOS), [
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

test("resolveToolsetToolNames filters unavailable optional tools without leaving gaps", () => {
  const withoutOptionals = ALL_TOOL_INFOS.filter(
    (tool) => tool.name !== "WebSummary" && tool.name !== "FetchUrl",
  );

  assert.deepEqual(resolveToolsetToolNames("forge", withoutOptionals), [
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

test("resolveToolsetToolNames is stable regardless of tool registration order", () => {
  const reversed = [...ALL_TOOL_INFOS].reverse();

  assert.deepEqual(resolveToolsetToolNames("droid", reversed), resolveToolsetToolNames("droid", ALL_TOOL_INFOS));
  assert.deepEqual(resolveToolsetToolNames("codex", reversed), resolveToolsetToolNames("codex", ALL_TOOL_INFOS));
});
