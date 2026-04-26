import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { Box } from "@mariozechner/pi-tui";

import registerSkillExtension from "./index.ts";

const AVAILABLE_TOOLS = [
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
  { name: "Task", description: "task" },
];

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => `[bg]${text}[/bg]`,
  bold: (text: string) => text,
} as any;

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("skill extension registers the global skill tool and shared mode handlers", async () => {
  const handlers = new Map<string, Function[]>();
  const tools: string[] = [];
  let activeTools: string[] | undefined;

  registerSkillExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition: { name: string }) {
      tools.push(definition.name);
    },
    getAllTools() {
      return AVAILABLE_TOOLS;
    },
    getCommands() {
      return [];
    },
    setActiveTools(value: string[]) {
      activeTools = value;
    },
  } as never);

  assert.deepEqual(tools, ["skill"]);
  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);

  const sessionStartHandlers = handlers.get("session_start") ?? [];
  const ctx = {
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "pi" } }];
      },
    },
  };

  for (const handler of sessionStartHandlers) {
    await handler(undefined, ctx as never);
  }

  assert.deepEqual(activeTools, [
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
  ]);
});

test("skill tool resolves from Pi's loaded skill commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-tool-"));
  const skillDir = join(root, "brainstorming");
  const skillFile = join(skillDir, "SKILL.md");
  await mkdir(skillDir, { recursive: true });
  await writeFile(skillFile, "---\nname: brainstorming\ndescription: test skill\n---\n\n# Brainstorming\n");

  let toolDefinition: { execute: Function } | undefined;

  registerSkillExtension({
    on() {},
    registerTool(definition: { execute: Function }) {
      toolDefinition = definition;
    },
    getAllTools() {
      return AVAILABLE_TOOLS;
    },
    getCommands() {
      return [
        {
          name: "skill:brainstorming",
          source: "skill",
          description: "test skill",
          sourceInfo: {
            path: skillFile,
            source: "local",
            scope: "user",
            origin: "top-level",
            baseDir: skillDir,
          },
        },
      ];
    },
    setActiveTools() {},
  } as never);

  const result = await toolDefinition?.execute("tool-call-id", { name: "brainstorming" }, undefined, undefined, undefined);

  assert.equal(typeof result, "object");
  assert.match(result?.content?.[0]?.text ?? "", /name: brainstorming/);
  assert.deepEqual(result?.details, {
    name: "brainstorming",
    skill_dir: skillDir,
  });
});

test("skill uses a self-rendered shell and hides collapsed result", () => {
  let toolDefinition: any;

  registerSkillExtension({
    on() {},
    registerTool(definition: any) {
      toolDefinition = definition;
    },
    getAllTools() {
      return AVAILABLE_TOOLS;
    },
    getCommands() {
      return [];
    },
    setActiveTools() {},
  } as never);

  const state: Record<string, unknown> = {};
  const call = toolDefinition.renderCall({ name: "brainstorming" }, theme, {
    state,
    lastComponent: undefined,
  });

  assert.equal(toolDefinition.renderShell, "self");
  assert.ok(call instanceof Box);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Skill brainstorming",
  ]);

  const collapsed = toolDefinition.renderResult(
    { content: [{ type: "text", text: "# Brainstorming\nUse this skill." }] },
    { expanded: false, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined },
  );

  assert.deepEqual(collapsed.render(120), []);
  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Skill brainstorming",
  ]);

  toolDefinition.renderResult(
    { content: [{ type: "text", text: "# Brainstorming\nUse this skill." }] },
    { expanded: true, isPartial: false },
    theme,
    { state, isError: false, lastComponent: undefined },
  );

  assert.deepEqual(trimRenderedLines(call.render(120)).map((line) => line.trim()), [
    "Skill brainstorming",
    "# Brainstorming",
    "Use this skill.",
  ]);
});
