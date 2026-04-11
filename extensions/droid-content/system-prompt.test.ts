import assert from "node:assert/strict";
import test from "node:test";

import {
  handleDroidSystemPromptBeforeAgentStart,
  type DroidSystemPromptDeps,
} from "./system-prompt.ts";

function createContext(toolSet: "pi" | "codex" | "droid", modelId = "gpt-5.4") {
  return {
    model: { id: modelId },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  };
}

test("handleDroidSystemPromptBeforeAgentStart returns no-op when Droid prompt is not selected", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      systemMdPrompt: true,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("pi") as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleDroidSystemPromptBeforeAgentStart defers to SYSTEM.md when enabled and present", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-system-md-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: true,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    {
      ...createContext("droid"),
      cwd: tempDir,
    } as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "System MD prompt" });
});

test("handleDroidSystemPromptBeforeAgentStart still replaces when SYSTEM.md is enabled but missing", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-no-system-md-"));
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: true,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    {
      ...createContext("droid"),
      cwd: tempDir,
    } as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Droid block" });
});

test("handleDroidSystemPromptBeforeAgentStart uses the Droid prompt when SYSTEM.md injection is disabled", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-droid-system-md-disabled-"));
  await fs.writeFile(path.join(tempDir, "SYSTEM.md"), "System MD prompt\n");

  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: false,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    {
      ...createContext("droid"),
      cwd: tempDir,
    } as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Droid block" });
});

test("handleDroidSystemPromptBeforeAgentStart still replaces when SYSTEM.md is not configured", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: false,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Droid block" });
});

test("handleDroidSystemPromptBeforeAgentStart replaces the active system prompt", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: true,
      includePiPromptSection: false,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Base" } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Droid block" });
});

test("handleDroidSystemPromptBeforeAgentStart appends the Droid prompt after the Pi prompt when enabled", async () => {
  const deps: DroidSystemPromptDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: false,
      includePiPromptSection: true,
    }),
    buildPromptForModel: () => "Droid block",
  };

  const result = await handleDroidSystemPromptBeforeAgentStart(
    { systemPrompt: "Pi base" } as never,
    createContext("droid") as never,
    deps,
  );

  assert.deepEqual(result, { systemPrompt: "Pi base\n\nDroid block" });
});
