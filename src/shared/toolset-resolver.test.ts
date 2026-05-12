import assert from "node:assert/strict";
import test from "node:test";

import registerFffLifecycleExtension from "../fff/index.js";
import { resolveRegisteredToolInfos, resolveToolsetToolNames } from "./toolset-resolver.js";

const ALL_TOOL_INFOS = resolveRegisteredToolInfos([
  { name: "read", description: "custom read" },
  { name: "grep", description: "builtin grep" },
  { name: "find", description: "builtin find" },
  { name: "ls", description: "builtin ls" },
  { name: "edit", description: "builtin edit" },
  { name: "write", description: "builtin write" },
  { name: "bash", description: "builtin bash" },
  { name: "shell", description: "compat shell" },
  { name: "WebSearch", description: "web search" },
  { name: "WebSummary", description: "web summary" },
  { name: "FetchUrl", description: "fetch" },
  { name: "skill", description: "skill" },
  { name: "boomerang", description: "boomerang" },
  { name: "get_goal", description: "goal" },
  { name: "create_goal", description: "goal" },
  { name: "update_goal", description: "goal" },
  { name: "update_plan", description: "codex" },
  { name: "read_plan", description: "codex" },
  { name: "request_user_input", description: "codex" },
  { name: "list_dir", description: "codex" },
  { name: "find_files", description: "codex" },
  { name: "grep_files", description: "codex" },
  { name: "apply_patch", description: "codex" },
  { name: "view_image", description: "codex" },
  { name: "LS", description: "droid" },
  { name: "Grep", description: "droid" },
  { name: "Glob", description: "droid" },
  { name: "Create", description: "droid" },
  { name: "Edit", description: "droid" },
  { name: "ApplyPatch", description: "droid" },
  { name: "AskUser", description: "droid" },
  { name: "TodoWrite", description: "droid" },
  { name: "Execute", description: "droid" },
  { name: "spawn_agent", description: "subagent codex" },
  { name: "send_message", description: "subagent codex" },
  { name: "wait_agent", description: "subagent codex" },
  { name: "list_agents", description: "subagent codex" },
  { name: "close_agent", description: "subagent codex" },
  { name: "Task", description: "task" },
  { name: "mcp__vesper__vesper_execute", description: "external" },
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
    "skill",
    "boomerang",
    "get_goal",
    "create_goal",
    "update_goal",
    "Task",
    "mcp__vesper__vesper_execute",
  ]);

  assert.deepEqual(resolveToolsetToolNames("codex", ALL_TOOL_INFOS), [
    "shell",
    "read",
    "WebSearch",
    "WebSummary",
    "FetchUrl",
    "skill",
    "boomerang",
    "get_goal",
    "create_goal",
    "update_goal",
    "update_plan",
    "read_plan",
    "request_user_input",
    "list_dir",
    "find_files",
    "grep_files",
    "apply_patch",
    "view_image",
    "spawn_agent",
    "send_message",
    "wait_agent",
    "list_agents",
    "close_agent",
    "mcp__vesper__vesper_execute",
  ]);

  assert.deepEqual(resolveToolsetToolNames("droid", ALL_TOOL_INFOS), [
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
    "boomerang",
    "get_goal",
    "create_goal",
    "update_goal",
    "Task",
    "mcp__vesper__vesper_execute",
  ]);
});

test("resolveToolsetToolNames filters unavailable optional tools without leaving gaps", () => {
  const withoutOptionals = ALL_TOOL_INFOS.filter(
    (tool) => tool.name !== "WebSummary" && tool.name !== "FetchUrl",
  );

  assert.deepEqual(resolveToolsetToolNames("droid", withoutOptionals), [
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
    "skill",
    "boomerang",
    "get_goal",
    "create_goal",
    "update_goal",
    "Task",
    "mcp__vesper__vesper_execute",
  ]);
});

test("resolveToolsetToolNames scopes Codex and Droid tools but preserves external tools", () => {
  const piTools = resolveToolsetToolNames("pi", ALL_TOOL_INFOS);
  const codexTools = resolveToolsetToolNames("codex", ALL_TOOL_INFOS);
  const droidTools = resolveToolsetToolNames("droid", ALL_TOOL_INFOS);

  for (const toolNames of [piTools, codexTools, droidTools]) {
    assert.ok(toolNames.includes("WebSearch"));
    assert.ok(toolNames.includes("boomerang"));
    assert.ok(toolNames.includes("get_goal"));
    assert.ok(toolNames.includes("mcp__vesper__vesper_execute"));
  }

  assert.equal(piTools.includes("update_plan"), false);
  assert.equal(piTools.includes("LS"), false);
  assert.ok(codexTools.includes("update_plan"));
  assert.equal(codexTools.includes("LS"), false);
  assert.ok(droidTools.includes("LS"));
  assert.equal(droidTools.includes("update_plan"), false);
});

test("resolveToolsetToolNames is stable regardless of tool registration order", () => {
  const reversed = [...ALL_TOOL_INFOS].reverse();

  assert.deepEqual(
    resolveToolsetToolNames("droid", reversed),
    resolveToolsetToolNames("droid", ALL_TOOL_INFOS),
  );
  assert.deepEqual(
    resolveToolsetToolNames("codex", reversed),
    resolveToolsetToolNames("codex", ALL_TOOL_INFOS),
  );
});

test("fff lifecycle extension does not register any public tools", () => {
  const registeredTools: string[] = [];
  const registeredCommands: string[] = [];
  const registeredRenderers: string[] = [];
  const handlers = new Map<string, Function[]>();

  registerFffLifecycleExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand(name: string) {
      registeredCommands.push(name);
    },
    registerMessageRenderer(customType: string) {
      registeredRenderers.push(customType);
    },
    sendMessage() {},
    registerTool(tool: { name: string }) {
      registeredTools.push(tool.name);
    },
  } as never);

  assert.equal(registeredTools.length, 0);
  assert.deepEqual(registeredCommands.sort(), ["fff-reindex", "fff-status"]);
  assert.deepEqual(registeredRenderers, ["fff-command-result"]);
  assert.deepEqual([...handlers.keys()].sort(), [
    "before_agent_start",
    "session_shutdown",
    "session_start",
  ]);
});

test("toolset resolution keeps read active across modes and preserves unclassified tools", () => {
  const withHypotheticalFffTools = resolveRegisteredToolInfos([
    ...ALL_TOOL_INFOS,
    { name: "fff_status", description: "internal fff status" },
    { name: "reindex_fff", description: "internal fff reindex" },
    { name: "resolve_file", description: "standalone fff resolve" },
    { name: "related_files", description: "standalone fff related files" },
    { name: "fff_grep", description: "standalone fff grep" },
  ]);

  for (const mode of ["pi", "codex", "droid"] as const) {
    const toolNames = resolveToolsetToolNames(mode, withHypotheticalFffTools);
    assert.ok(toolNames.includes("read"));
    assert.ok(toolNames.includes("resolve_file"));
    assert.ok(toolNames.includes("related_files"));
  }
});
