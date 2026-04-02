# Prompt Pack Package Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic prompt-pack extension plus a package-wide settings extension that persists `tungthedev/pi.systemPrompt` and drives Codex or Forge prompt injection.

**Architecture:** The implementation splits prompt selection from settings management. `extensions/settings/` owns config parsing, writing, and the `/tungthedev` settings UI, while `extensions/prompt-pack/` owns `before_agent_start` prompt resolution and injection. Forge prompt generation is refactored to read from a shared runtime surface so `prompt-pack` can render the live Forge prompt without `forge-content` owning injection.

**Tech Stack:** TypeScript, Bun test runner, Pi Extension API, Pi TUI settings/select UI, JSON settings files under `~/.pi/agent/settings.json`

---

## File Structure

### New files

- `extensions/settings/config.ts`
  - Read and write the `tungthedev/pi` namespace in global Pi settings.
- `extensions/settings/config.test.ts`
  - Protect package settings parsing, validation, and atomic write semantics.
- `extensions/settings/ui.ts`
  - Parse `/tungthedev` arguments and build the initial settings UI flow.
- `extensions/settings/index.ts`
  - Register `/tungthedev` and connect command actions to config helpers.
- `extensions/settings/index.test.ts`
  - Verify command argument handling and user-visible command behavior.
- `extensions/prompt-pack/packs/codex.ts`
  - Hold reusable Codex prompt resolution and injection helpers moved out of the legacy extension.
- `extensions/prompt-pack/packs/codex.test.ts`
  - Protect Codex model-catalog fallback and idempotent prompt injection behavior.
- `extensions/prompt-pack/packs/forge.ts`
  - Build the Forge prompt from the shared Forge runtime snapshot.
- `extensions/prompt-pack/packs/forge.test.ts`
  - Protect Forge pack resolution behavior.
- `extensions/prompt-pack/index.ts`
  - Register the generic prompt-pack extension and inject the selected prompt in `before_agent_start`.
- `extensions/prompt-pack/index.test.ts`
  - Verify `none`, `codex`, `forge`, and invalid-setting behavior.
- `extensions/forge-content/runtime-state.ts`
  - Expose the live Forge mode and active tool snapshot to both `forge-content` and `prompt-pack`.
- `extensions/forge-content/runtime-state.test.ts`
  - Protect shared Forge runtime state transitions.

### Modified files

- `extensions/forge-content/index.ts`
  - Stop injecting the Forge prompt directly and initialize shared Forge runtime state.
- `extensions/forge-content/agents/commands.ts`
  - Write mode changes into the shared runtime surface before the next user turn.
- `extensions/forge-content/agents/modes.ts`
  - Keep mode application focused on tool/status behavior while sharing mode definitions with the new runtime-state helper.
- `package.json`
  - Ship the new extensions, remove the legacy Codex prompt extension entry, and update test targets.
- `README.md`
  - Update the package extension list and command docs.

### Deleted or retired files

- `extensions/codex-system-prompt/index.ts`
- `extensions/codex-system-prompt/index.test.ts`

Retain the bundled `models.json` asset by moving it under `extensions/prompt-pack/` if the new Codex helper still needs it.

### Reference files to read before implementation

- `docs/superpowers/specs/2026-04-02-prompt-pack-settings-design.md`
- `extensions/codex-system-prompt/index.ts`
- `extensions/forge-content/index.ts`
- `extensions/forge-content/agents/commands.ts`
- `extensions/forge-content/agents/modes.ts`
- `extensions/forge-content/prompt/build-system-prompt.ts`
- `extensions/ext-manager/packages/settings.ts`

### Task 1: Add package settings config helpers

**Files:**
- Create: `extensions/settings/config.ts`
- Create: `extensions/settings/config.test.ts`
- Reference: `extensions/ext-manager/packages/settings.ts`

- [ ] **Step 1: Write the failing config tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTungthedevSettings,
  readTungthedevSettingsFromFile,
  writeSystemPromptSetting,
} from "./config.ts";

test("parseTungthedevSettings accepts codex, forge, and null", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "codex" } }), {
    systemPrompt: "codex",
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: null } }), {
    systemPrompt: null,
  });
});

test("parseTungthedevSettings falls back to null for invalid values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "weird" } }), {
    systemPrompt: null,
  });
});

test("writeSystemPromptSetting preserves unrelated root settings", async () => {
  // temp file contains theme + packages + another namespaced object
  // write forge
  // assert unrelated settings stay intact and namespace updates
});

test("readTungthedevSettingsFromFile fails closed on malformed json", async () => {
  // temp file contains invalid JSON
  // assert the reader returns { systemPrompt: null } instead of throwing
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/settings/config.test.ts`
Expected: FAIL with module not found or missing exports from `extensions/settings/config.ts`

- [ ] **Step 3: Write the minimal config implementation**

```ts
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type SystemPromptPack = "codex" | "forge" | null;
export type TungthedevSettings = { systemPrompt: SystemPromptPack };

export function parseTungthedevSettings(root: unknown): TungthedevSettings {
  const namespace =
    root && typeof root === "object" && !Array.isArray(root)
      ? (root as Record<string, unknown>)["tungthedev/pi"]
      : undefined;
  const value =
    namespace && typeof namespace === "object" && !Array.isArray(namespace)
      ? (namespace as Record<string, unknown>).systemPrompt
      : undefined;
  return {
    systemPrompt: value === "codex" || value === "forge" || value === null ? value : null,
  };
}

export async function writeSystemPromptSetting(value: SystemPromptPack, cwd = process.cwd()): Promise<void> {
  const path = join(getAgentDir(), "settings.json");
  // read root object, replace only `tungthedev/pi`, write atomically
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ./extensions/settings/config.test.ts`
Expected: PASS for parsing and write-preservation coverage

- [ ] **Step 5: Commit**

```bash
git add extensions/settings/config.ts extensions/settings/config.test.ts
git commit -m "feat: add tungthedev package settings helpers"
```

### Task 2: Add `/tungthedev` command parsing and settings UI

**Files:**
- Create: `extensions/settings/ui.ts`
- Create: `extensions/settings/index.ts`
- Create: `extensions/settings/index.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing command tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseSettingsCommand } from "./ui.ts";

test("parseSettingsCommand handles direct system-prompt writes", () => {
  assert.deepEqual(parseSettingsCommand("system-prompt forge"), {
    action: "set-system-prompt",
    value: "forge",
  });
});

test("parseSettingsCommand handles none alias", () => {
  assert.deepEqual(parseSettingsCommand("system-prompt none"), {
    action: "set-system-prompt",
    value: null,
  });
});

test("parseSettingsCommand opens UI when no args are provided", () => {
  assert.deepEqual(parseSettingsCommand(""), { action: "open-root" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/settings/index.test.ts`
Expected: FAIL because the command parser and extension entrypoint do not exist yet

- [ ] **Step 3: Implement parser, UI, and command wiring**

```ts
export function parseSettingsCommand(args: string):
  | { action: "open-root" }
  | { action: "open-system-prompt" }
  | { action: "set-system-prompt"; value: "codex" | "forge" | null }
  | { action: "invalid"; message: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "open-root" };
  if (parts[0] !== "system-prompt") return { action: "invalid", message: `Unknown setting: ${parts[0]}` };
  if (parts.length === 1) return { action: "open-system-prompt" };
  if (parts[1] === "none") return { action: "set-system-prompt", value: null };
  if (parts[1] === "codex" || parts[1] === "forge") return { action: "set-system-prompt", value: parts[1] };
  return { action: "invalid", message: `Unknown system prompt pack: ${parts[1]}` };
}
```

For the first UI pass, build a package settings surface even though it has one setting. Use `SettingsList` or `ctx.ui.custom()` so `/tungthedev` opens a reusable package settings UI and `/tungthedev system-prompt` can focus that setting inside the same surface:

```ts
await ctx.ui.custom((_tui, _theme, _kb, done) => {
  const items = [
    {
      id: "systemPrompt",
      label: "System prompt pack",
      currentValue: currentLabel,
      values: ["None", "Codex", "Forge"],
    },
  ];
  // render a SettingsList and call writeSystemPromptSetting() on change
});
```

Then map the selected value to `null | "codex" | "forge"`, write it with `writeSystemPromptSetting()`, and notify the user.

- [ ] **Step 4: Run tests to verify command behavior**

Run: `bun test ./extensions/settings/index.test.ts`
Expected: PASS for parser behavior and command handler mocks

- [ ] **Step 5: Commit**

```bash
git add extensions/settings/ui.ts extensions/settings/index.ts extensions/settings/index.test.ts package.json
git commit -m "feat: add tungthedev settings command"
```

### Task 3: Move Codex prompt logic into `prompt-pack`

**Files:**
- Create: `extensions/prompt-pack/packs/codex.ts`
- Create: `extensions/prompt-pack/packs/codex.test.ts`
- Create or move: `extensions/prompt-pack/assets/models.json`
- Reference then retire: `extensions/codex-system-prompt/index.ts`

- [ ] **Step 1: Write the failing Codex pack tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { injectCodexPrompt, resolveCodexPromptBody } from "./codex.ts";

test("resolveCodexPromptBody uses exact model match before GPT fallback", () => {
  const prompt = resolveCodexPromptBody("claude-sonnet", [
    { models: [{ slug: "gpt-5.4", base_instructions: "fallback" }] },
    { models: [{ slug: "claude-sonnet", base_instructions: "exact" }] },
  ]);
  assert.equal(prompt, "exact");
});

test("injectCodexPrompt remains idempotent", () => {
  const once = injectCodexPrompt("Base", "Codex");
  const twice = injectCodexPrompt(once, "Codex");
  assert.equal(twice, once);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/prompt-pack/packs/codex.test.ts`
Expected: FAIL because `codex.ts` does not exist yet

- [ ] **Step 3: Move the minimal Codex prompt helpers**

Move these functions into `extensions/prompt-pack/packs/codex.ts` with the same behavior:

```ts
export function readModelsCatalog(...) { ... }
export function readFallbackModelsCatalog(...) { ... }
export function readCodexPersonality(...) { ... }
export function resolveCodexPromptBody(...) { ... }
export function injectCodexPrompt(systemPrompt: string | undefined, codexPrompt: string): string { ... }
export function buildSelectedCodexPrompt(modelId: string | undefined): string { ... }
```

Keep the GPT fallback, personality parsing, and asset loading behavior unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ./extensions/prompt-pack/packs/codex.test.ts`
Expected: PASS for exact-match, fallback, personality, and idempotence coverage

- [ ] **Step 5: Commit**

```bash
git add extensions/prompt-pack/packs/codex.ts extensions/prompt-pack/packs/codex.test.ts extensions/prompt-pack/assets/models.json
git commit -m "refactor: move codex prompt logic into prompt-pack"
```

### Task 4: Extract shared Forge runtime state

**Files:**
- Create: `extensions/forge-content/runtime-state.ts`
- Create: `extensions/forge-content/runtime-state.test.ts`
- Modify: `extensions/forge-content/index.ts`
- Modify: `extensions/forge-content/agents/commands.ts`
- Modify: `extensions/forge-content/agents/modes.ts`

- [ ] **Step 1: Write the failing Forge runtime-state tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  createForgeRuntimeState,
  setForgeRuntimeMode,
  getForgeRuntimeSnapshot,
} from "./runtime-state.ts";

test("shared forge runtime snapshot reflects the latest selected mode", () => {
  const state = createForgeRuntimeState();
  setForgeRuntimeMode(state, "muse");
  assert.equal(getForgeRuntimeSnapshot(state).mode, "muse");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/forge-content/runtime-state.test.ts`
Expected: FAIL because the runtime-state module does not exist yet

- [ ] **Step 3: Implement shared runtime-state helpers and refactor Forge wiring**

```ts
export type ForgeRuntimeState = {
  currentMode: ForgeModeName;
};

export function createForgeRuntimeState(): ForgeRuntimeState {
  return { currentMode: "forge" };
}

export function setForgeRuntimeMode(state: ForgeRuntimeState, mode: ForgeModeName): void {
  state.currentMode = mode;
}

export function buildForgePromptOptions(pi: ExtensionAPI, ctx: ExtensionContext, state: ForgeRuntimeState) {
  const modeDefinition = getForgeModeDefinition(state.currentMode);
  return {
    cwd: ctx.cwd,
    activeTools: getActiveToolInfos(pi),
    mode: state.currentMode,
    modeInstructions: modeDefinition.promptInstructions,
    shell: process.env.SHELL,
    homeDir: process.env.HOME,
  };
}
```

Then update `registerForgeModeCommands()` and `extensions/forge-content/index.ts` to use the shared state helper and remove the direct `before_agent_start` handler.

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test ./extensions/forge-content/runtime-state.test.ts ./extensions/forge-content/agents/modes.test.ts ./extensions/forge-content/prompt/build-system-prompt.test.ts`
Expected: PASS, with no Forge prompt injection left in `forge-content/index.ts`

- [ ] **Step 5: Commit**

```bash
git add extensions/forge-content/runtime-state.ts extensions/forge-content/runtime-state.test.ts extensions/forge-content/index.ts extensions/forge-content/agents/commands.ts extensions/forge-content/agents/modes.ts
git commit -m "refactor: share forge runtime state with prompt-pack"
```

### Task 5: Add the generic `prompt-pack` extension

**Files:**
- Create: `extensions/prompt-pack/packs/forge.ts`
- Create: `extensions/prompt-pack/packs/forge.test.ts`
- Create: `extensions/prompt-pack/index.ts`
- Create: `extensions/prompt-pack/index.test.ts`
- Reference: `extensions/settings/config.ts`
- Reference: `extensions/forge-content/runtime-state.ts`

- [ ] **Step 1: Write the failing prompt-pack integration tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { resolvePromptPack, injectSelectedPromptPack } from "./index.ts";

test("invalid settings resolve to none", () => {
  assert.equal(resolvePromptPack({ systemPrompt: null }), null);
});

test("forge selection appends forge prompt", () => {
  const result = injectSelectedPromptPack({
    baseSystemPrompt: "Base",
    selectedPack: "forge",
    forgePrompt: "Forge block",
  });
  assert.match(result, /^Base\n\nForge block/m);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/prompt-pack/index.test.ts ./extensions/prompt-pack/packs/forge.test.ts`
Expected: FAIL because the extension wiring does not exist yet

- [ ] **Step 3: Implement prompt-pack resolution and extension registration**

```ts
pi.on("before_agent_start", async (event, ctx) => {
  const settings = await readTungthedevSettingsFromFile();

  if (settings.systemPrompt === "codex") {
    const codexPrompt = buildSelectedCodexPrompt(ctx.model?.id);
    return { systemPrompt: injectCodexPrompt(event.systemPrompt, codexPrompt) };
  }

  if (settings.systemPrompt === "forge") {
    const forgePrompt = buildSelectedForgePrompt(pi, ctx);
    return {
      systemPrompt: buildForgePrompt({
        baseSystemPrompt: event.systemPrompt,
        ...forgePrompt,
      }),
    };
  }

  return undefined;
});
```

Important:

- Read the config fresh on each `before_agent_start` so `/tungthedev` changes apply on the next turn without `/reload`.
- Build the Forge prompt from the shared Forge runtime state, not from local `forge-content` state.
- Fail closed to the base prompt if anything goes wrong.

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test ./extensions/prompt-pack/index.test.ts ./extensions/prompt-pack/packs/forge.test.ts ./extensions/prompt-pack/packs/codex.test.ts`
Expected: PASS for `none`, `codex`, `forge`, and invalid-setting behavior

- [ ] **Step 5: Commit**

```bash
git add extensions/prompt-pack/index.ts extensions/prompt-pack/index.test.ts extensions/prompt-pack/packs/forge.ts extensions/prompt-pack/packs/forge.test.ts
git commit -m "feat: add generic prompt-pack extension"
```

### Task 6: Remove legacy prompt extension and wire package metadata

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Delete: `extensions/codex-system-prompt/index.ts`
- Delete: `extensions/codex-system-prompt/index.test.ts`

- [ ] **Step 1: Write the failing packaging and docs assertions**

Add or extend a lightweight test that checks the package extension list contains `prompt-pack` and `settings` instead of `codex-system-prompt`.

```ts
test("package manifest ships prompt-pack and settings extensions", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert(pkg.pi.extensions.includes("./extensions/prompt-pack/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/settings/index.ts"));
  assert(!pkg.pi.extensions.includes("./extensions/codex-system-prompt/index.ts"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/settings/index.test.ts`
Expected: FAIL until the manifest assertions pass after `package.json` is updated

- [ ] **Step 3: Update package metadata and remove legacy files**

Make these edits:

```json
{
  "description": "A Pi package containing ... prompt-pack, forge-content, settings, ...",
  "scripts": {
    "test": "bun test ./extensions/editor ./extensions/web-search ./extensions/codex-content ./extensions/prompt-pack ./extensions/codex-subagents ./extensions/ext-manager ./extensions/forge-content ./extensions/settings"
  },
  "pi": {
    "extensions": [
      "./extensions/prompt-pack/index.ts",
      "./extensions/settings/index.ts"
    ]
  }
}
```

Update the README extension list to mention:

- `prompt-pack` — generic prompt-pack selection and injection
- `settings` — package settings command exposed via `/tungthedev`

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test ./extensions/settings/index.test.ts`
Expected: PASS for manifest assertions and command behavior

- [ ] **Step 5: Commit**

```bash
git add package.json README.md extensions/codex-system-prompt
git commit -m "chore: replace legacy codex system prompt extension"
```

### Task 7: Full verification

**Files:**
- Modify as needed from previous tasks only

- [ ] **Step 1: Run focused extension tests**

Run:

```bash
bun test ./extensions/settings ./extensions/prompt-pack ./extensions/forge-content
```

Expected: PASS for all new and changed extension suites

- [ ] **Step 2: Run package-wide tests**

Run:

```bash
bun run test
```

Expected: PASS across the shipped extension suites listed in `package.json`

- [ ] **Step 3: Run lint and typecheck**

Run:

```bash
bun run lint
bun run typecheck
```

Expected: PASS with no new lint or type errors

- [ ] **Step 4: Manually verify next-turn behavior**

Manual check in Pi:

1. Start Pi with this package loaded.
2. Run `/tungthedev system-prompt forge`.
3. Send a prompt and confirm Forge prompt content is active.
4. Run `/forge-mode muse`.
5. Send another prompt and confirm the Forge prompt reflects `muse` mode.
6. Run `/tungthedev system-prompt none`.
7. Send another prompt and confirm the extra package prompt is gone.

Expected: all changes take effect on the next turn without `/reload`.

- [ ] **Step 5: Commit final verification fixes**

```bash
git add extensions/settings extensions/prompt-pack extensions/forge-content package.json README.md
git commit -m "test: verify prompt-pack settings flow end to end"
```

## Notes For The Implementer

- Keep the first settings UI pass simple, but it still needs to be a reusable package settings surface. Use `SettingsList` or a small `ctx.ui.custom()` wrapper instead of a one-off `ctx.ui.select()` dialog.
- Do not add project-local settings support in this change.
- Prefer importing shared helpers over duplicating config parsing or prompt-construction logic.
- If the Forge runtime state needs one extra helper module split, do it early rather than growing `extensions/forge-content/index.ts`.
- When retiring `extensions/codex-system-prompt`, make sure no remaining tests or manifest entries still import it.
