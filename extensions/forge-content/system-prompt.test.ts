import assert from "node:assert/strict";
import test from "node:test";

import { setSystemMdPromptEnabledForTests } from "../system-md/state.ts";
import {
  buildSelectedForgePrompt,
  handleForgeSystemPromptBeforeAgentStart,
  injectForgePrompt,
  registerForgeSystemPrompt,
  renderForgePromptTemplate,
  resolveForgeToolInfos,
  type ForgeSystemPromptDeps,
} from "./system-prompt.ts";

function createContext(toolSet: "pi" | "codex" | "forge") {
  return {
    model: { id: "gpt-5.4" },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  };
}

test("buildSelectedForgePrompt renders the prompt template without unresolved tokens", () => {
  const prompt = buildSelectedForgePrompt(
    {
      getAllTools: () => [
        { name: "write", description: "Writes files." },
        { name: "shell", description: "Executes shell commands." },
        { name: "read_file", description: "Reads files." },
        { name: "WebSearch", description: "Searches the web." },
        { name: "FetchUrl", description: "Fetches a URL." },
        { name: "fs_search", description: "Searches the filesystem." },
        { name: "patch", description: "Applies a patch." },
        { name: "followup", description: "Asks a followup question." },
        { name: "todos_write", description: "Writes todos." },
        { name: "todos_read", description: "Reads todos." },
        { name: "Task", description: "Spawns a task." },
        { name: "TaskOutput", description: "Reads a task result." },
        { name: "TaskStop", description: "Stops a task." },
      ],
    } as never,
    {
      cwd: "/tmp/project",
    } as never,
  );

  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.match(prompt, /todos_write tool/);
  assert.match(prompt, /shell to run build/);
  assert.match(prompt, /patch to fix first error/);
  assert.match(prompt, /fs_search to research existing metrics/);
  assert.doesNotMatch(prompt, /\{\{[^}]+\}\}/);
  assert.doesNotMatch(prompt, /<operating_mode>/);
  assert.doesNotMatch(prompt, /modeInstructions|\bmuse\b|\bsage\b/);
});

test("renderForgePromptTemplate neutralizes unavailable optional tool placeholders", () => {
  const prompt = renderForgePromptTemplate(
    "Optional tool: {{tool_names.WebSummary}}",
    {
      activeTools: [{ name: "shell", description: "Executes shell commands." }],
    },
  );

  assert.equal(prompt, "Optional tool: an optional web summarization tool");
});

test("resolveForgeToolInfos uses the centralized forge resolver", () => {
  assert.deepEqual(
    resolveForgeToolInfos({
      getAllTools: () => [
        { name: "write", description: "Writes files." },
        { name: "shell", description: "Executes shell commands." },
        { name: "read_file", description: "Reads files." },
        { name: "WebSearch", description: "Searches the web." },
        { name: "fs_search", description: "Searches the filesystem." },
        { name: "patch", description: "Applies a patch." },
        { name: "followup", description: "Asks a followup question." },
        { name: "todos_write", description: "Writes todos." },
        { name: "todos_read", description: "Reads todos." },
        { name: "Task", description: "Spawns a task." },
        { name: "TaskOutput", description: "Reads a task result." },
        { name: "TaskStop", description: "Stops a task." },
        { name: "read", description: "Builtin read." },
        { name: "update_plan", description: "Codex plan." },
      ],
    } as never),
    [
      { name: "write", description: "Writes files.", availability: "optional" },
      { name: "shell", description: "Executes shell commands.", availability: "optional" },
      { name: "read_file", description: "Reads files.", availability: "optional" },
      { name: "WebSearch", description: "Searches the web.", availability: "optional" },
      { name: "fs_search", description: "Searches the filesystem.", availability: "optional" },
      { name: "patch", description: "Applies a patch.", availability: "optional" },
      { name: "followup", description: "Asks a followup question.", availability: "optional" },
      { name: "todos_write", description: "Writes todos.", availability: "optional" },
      { name: "todos_read", description: "Reads todos.", availability: "optional" },
      { name: "Task", description: "Spawns a task.", availability: "optional" },
      { name: "TaskOutput", description: "Reads a task result.", availability: "optional" },
      { name: "TaskStop", description: "Stops a task.", availability: "optional" },
    ],
  );
});

test("injectForgePrompt replaces the incoming prompt", () => {
  assert.equal(injectForgePrompt("Base", "Forge block"), "Forge block");
  assert.equal(injectForgePrompt(undefined, "Forge block"), "Forge block");
});

test("handleForgeSystemPromptBeforeAgentStart returns no-op when Forge prompt is not selected", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  const result = await handleForgeSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("codex") as never,
    {} as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleForgeSystemPromptBeforeAgentStart returns no-op when system-md is enabled", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleForgeSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      createContext("forge") as never,
      {} as never,
      deps,
    );

    assert.equal(result, undefined);
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleForgeSystemPromptBeforeAgentStart still replaces when system-md is loaded but disabled in settings", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      systemMdPrompt: false,
    }),
    buildPromptForContext: () => "Forge block",
  };

  setSystemMdPromptEnabledForTests(true);

  try {
    const result = await handleForgeSystemPromptBeforeAgentStart(
      { systemPrompt: "Base" } as never,
      createContext("forge") as never,
      {} as never,
      deps,
    );

    assert.deepEqual(result, { systemPrompt: "Forge block" });
  } finally {
    setSystemMdPromptEnabledForTests(false);
  }
});

test("handleForgeSystemPromptBeforeAgentStart replaces the selected Forge prompt", async () => {
  const deps: ForgeSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "forge",
      systemMdPrompt: true,
    }),
    buildPromptForContext: () => "Forge block",
  };

  const result = await handleForgeSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("forge") as never,
    {} as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Forge block" });
});

test("registerForgeSystemPrompt registers before_agent_start", () => {
  let eventName: string | undefined;

  registerForgeSystemPrompt({
    on(name: string) {
      eventName = name;
    },
  } as never);

  assert.equal(eventName, "before_agent_start");
});
