# Forge Inner-Mode Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify `forge-content` into a single static Forge harness, remove all Forge slash commands and inner modes, and keep Sage only through the `explorer` subagent while preserving the top-level `codex`/`forge` tool-set switch in settings.

**Architecture:** The implementation deletes Forge’s inner mode system instead of hiding it. `extensions/settings/` remains the only place that switches between Codex and Forge tool sets, `extensions/forge-content/` applies one static Forge preset when enabled, `extensions/prompt-pack/` builds Forge prompt text from static runtime context only, and `extensions/subagents/` remains the sole home of the Sage research persona via `explorer`.

**Tech Stack:** TypeScript, Bun test runner, Pi Extension API, Pi TUI status/widget APIs, package settings under `~/.pi/agent/settings.json`

---

## File Structure

### Files to delete

- `extensions/forge-content/agents/commands.ts`
  - Remove Forge slash command registration entirely.
- `extensions/forge-content/agents/modes.ts`
  - Remove the inner `forge` / `sage` / `muse` mode definitions and mode application helpers.
- `extensions/forge-content/agents/modes.test.ts`
  - Remove mode-specific tests once the mode system is gone.
- `extensions/forge-content/runtime-state.ts`
  - Remove shared inner-mode runtime state once prompt-pack no longer depends on it.
- `extensions/forge-content/runtime-state.test.ts`
  - Remove tests for deleted runtime state.

### Files to modify

- `extensions/forge-content/index.ts`
  - Replace mode-based sync with a single static Forge preset that only applies when `toolSet === "forge"`.
- `extensions/forge-content/workflow/todo-tools.ts`
  - Remove `/forge-todos` while leaving `todo_write`, `todo_read`, and widget behavior unchanged.
- `extensions/forge-content/prompt/build-system-prompt.ts`
  - Remove `mode` and `modeInstructions` from prompt assembly.
- `extensions/forge-content/prompt/build-system-prompt.test.ts`
  - Update tests to assert Forge prompt assembly without inner mode text.
- `extensions/prompt-pack/packs/forge.ts`
  - Build Forge prompt from static runtime context instead of deleted runtime-state helpers.
- `extensions/prompt-pack/packs/forge.test.ts`
  - Update tests to assert static Forge prompt behavior with no inner mode state.
- `extensions/subagents/assets/agents/explorer.toml`
  - Only touch if needed to preserve the exact Sage prompt text verbatim after cleanup.
- `extensions/subagents/subagents/profiles.test.ts`
  - Keep or refine the assertion that `explorer` still carries the Sage prompt text.
- `extensions/settings/index.test.ts`
  - Optionally add one manifest/behavior assertion if needed for removed Forge command surface.

### Reference files to read before implementation

- `docs/superpowers/specs/2026-04-02-forge-inner-mode-removal-design.md`
- `extensions/forge-content/index.ts`
- `extensions/forge-content/workflow/todo-tools.ts`
- `extensions/forge-content/prompt/build-system-prompt.ts`
- `extensions/prompt-pack/packs/forge.ts`
- `extensions/subagents/assets/agents/explorer.toml`
- `extensions/subagents/subagents/profiles.test.ts`
- `extensions/codex-content/compatibility-tools/index.ts`

## Task 1: Delete Forge inner mode commands and state

**Files:**
- Delete: `extensions/forge-content/agents/commands.ts`
- Delete: `extensions/forge-content/agents/modes.ts`
- Delete: `extensions/forge-content/runtime-state.ts`
- Delete: `extensions/forge-content/agents/modes.test.ts`
- Delete: `extensions/forge-content/runtime-state.test.ts`
- Modify: `extensions/forge-content/index.ts`

- [ ] **Step 1: Write the failing static-preset test**

Create or replace a Forge entrypoint test, for example `extensions/forge-content/index.test.ts`, that proves `forge-content` no longer depends on command or mode state:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import registerForgeContentExtension from "./index.ts";

test("forge-content applies one static Forge preset when toolSet is forge", async () => {
  const activeToolSets: string[][] = [];
  const handlers = new Map<string, Function[]>();

  registerForgeContentExtension({
    on(event: string, handler: Function) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand() {
      throw new Error("forge-content should not register slash commands");
    },
    setActiveTools(tools: string[]) {
      activeToolSets.push(tools);
    },
  } as never);

  assert.equal(handlers.has("session_start"), true);
  assert.equal(handlers.has("before_agent_start"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/forge-content/index.test.ts`
Expected: FAIL because `forge-content/index.ts` still imports mode/state helpers or still registers Forge commands.

- [ ] **Step 3: Write the minimal static Forge implementation**

In `extensions/forge-content/index.ts`, collapse the mode system to a single constant preset:

```ts
const STATIC_FORGE_TOOL_SET = [
  "read",
  "write",
  "shell",
  "fs_search",
  "patch",
  "followup",
  "todo_write",
  "todo_read",
];

async function syncForgeToolSet(pi: ExtensionAPI): Promise<void> {
  const settings = await readTungthedevSettings();
  if (settings.toolSet !== "forge") return;
  pi.setActiveTools(STATIC_FORGE_TOOL_SET);
}
```

Then:
- remove imports of `commands.ts`, `modes.ts`, and `runtime-state.ts`
- remove `registerForgeModeCommands(...)`
- delete the now-unused mode/state files and tests
- keep only the session hooks needed to apply the static Forge preset

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test ./extensions/forge-content/index.test.ts ./extensions/codex-content ./extensions/settings`
Expected: PASS, with no references left to Forge mode files or commands.

- [ ] **Step 5: Commit**

```bash
git add extensions/forge-content/index.ts extensions/forge-content/index.test.ts \
  extensions/forge-content/agents extensions/forge-content/runtime-state.ts \
  extensions/forge-content/runtime-state.test.ts
git commit -m "refactor: remove forge inner mode system"
```

## Task 2: Remove `/forge-todos` and keep widget-only todo visibility

**Files:**
- Modify: `extensions/forge-content/workflow/todo-tools.ts`
- Reference: `extensions/forge-content/workflow/todo-state.test.ts`
- Reference: `extensions/forge-content/workflow/todo-widget.ts`

- [ ] **Step 1: Write the failing regression test**

Add a focused test that proves Forge workflow registers the todo tools but not the command:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { registerForgeTodoTools } from "./todo-tools.ts";

test("registerForgeTodoTools does not register /forge-todos", () => {
  const commands: string[] = [];

  registerForgeTodoTools({
    on() {},
    registerTool() {},
    registerCommand(name: string) {
      commands.push(name);
    },
  } as never);

  assert.deepEqual(commands, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./extensions/forge-content/workflow`
Expected: FAIL because `todo-tools.ts` still registers `forge-todos`.

- [ ] **Step 3: Remove the command and keep tool/widget behavior only**

Delete this block from `todo-tools.ts`:

```ts
pi.registerCommand("forge-todos", {
  description: "Show current Forge todo items",
  handler: async (_args, ctx) => {
    state.snapshot = reconstructSnapshot(ctx);
    syncForgeTodoUi(ctx, state.snapshot.items);
    ctx.ui.notify(buildTodoReadText(state.snapshot.items), "info");
  },
});
```

Do not change:
- `todo_write`
- `todo_read`
- todo snapshot reconstruction
- todo widget/status sync

- [ ] **Step 4: Run tests to verify it passes**

Run: `bun test ./extensions/forge-content/workflow`
Expected: PASS, with existing todo state tests still green and the command-registration regression covered.

- [ ] **Step 5: Commit**

```bash
git add extensions/forge-content/workflow/todo-tools.ts
 git commit -m "refactor: remove forge todos command"
```

## Task 3: Remove mode wording from Forge prompt assembly

**Files:**
- Modify: `extensions/forge-content/prompt/build-system-prompt.ts`
- Modify: `extensions/forge-content/prompt/build-system-prompt.test.ts`
- Modify: `extensions/prompt-pack/packs/forge.ts`
- Modify: `extensions/prompt-pack/packs/forge.test.ts`

- [ ] **Step 1: Write the failing prompt tests**

Update the Forge prompt tests to assert there is no inner mode dependency:

```ts
test("buildSelectedForgePrompt does not include inner mode markup", () => {
  const prompt = buildSelectedForgePrompt(
    {
      getActiveTools: () => ["shell"],
      getAllTools: () => [{ name: "shell", description: "Executes shell commands." }],
    } as never,
    { cwd: "/tmp/project" } as never,
  );

  assert.match(prompt, /You are Forge, an expert software engineering assistant/);
  assert.doesNotMatch(prompt, /<operating_mode>/);
  assert.doesNotMatch(prompt, /modeInstructions|muse|sage/);
});
```

Also update `build-system-prompt.test.ts` so it no longer passes `mode` or `modeInstructions` and verifies active tools/runtime context still render.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test ./extensions/forge-content/prompt ./extensions/prompt-pack/packs/forge.test.ts`
Expected: FAIL because prompt types and tests still depend on `mode` / `modeInstructions`.

- [ ] **Step 3: Remove mode fields from prompt code**

In `build-system-prompt.ts`, simplify the options type and section assembly:

```ts
export type ForgePromptOptions = {
  baseSystemPrompt?: string;
  cwd: string;
  activeTools: Array<{ name: string; description: string }>;
  shell?: string;
  homeDir?: string;
  currentDate?: string;
};
```

Delete these fields and their uses:
- `mode`
- `modeInstructions`

In `prompt-pack/packs/forge.ts`, replace the runtime-state dependency with a small local context builder:

```ts
function getActiveToolInfos(pi: ExtensionAPI) {
  const activeToolNames = new Set(pi.getActiveTools());
  return pi
    .getAllTools()
    .filter((tool) => activeToolNames.has(tool.name))
    .map((tool) => ({ name: tool.name, description: tool.description }));
}

export function buildSelectedForgePrompt(pi: ExtensionAPI, ctx: ExtensionContext): string {
  return buildForgePrompt({
    cwd: ctx.cwd,
    activeTools: getActiveToolInfos(pi),
    shell: process.env.SHELL,
    homeDir: process.env.HOME,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./extensions/forge-content/prompt ./extensions/prompt-pack/packs/forge.test.ts ./extensions/prompt-pack/index.test.ts`
Expected: PASS, with Forge prompt behavior preserved but no inner mode text or state dependency remaining.

- [ ] **Step 5: Commit**

```bash
git add extensions/forge-content/prompt/build-system-prompt.ts \
  extensions/forge-content/prompt/build-system-prompt.test.ts \
  extensions/prompt-pack/packs/forge.ts extensions/prompt-pack/packs/forge.test.ts
 git commit -m "refactor: remove forge mode state from prompt assembly"
```

## Task 4: Keep Sage only through the explorer subagent

**Files:**
- Modify only if needed: `extensions/subagents/assets/agents/explorer.toml`
- Modify: `extensions/subagents/subagents/profiles.test.ts`

- [ ] **Step 1: Add a precise regression test for the Sage prompt text**

Strengthen the existing explorer test so it protects the exact Sage prompt handoff you care about without snapshotting the full file:

```ts
test("built-in explorer role keeps the Sage prompt text", () => {
  const explorer = resolveBuiltInAgentProfiles({ includeHidden: true }).profiles.get("explorer");
  assert.ok(explorer);
  assert.match(explorer?.developerInstructions ?? "", /^You are Sage, an expert codebase research and exploration assistant/m);
  assert.match(explorer?.developerInstructions ?? "", /Strictly Read-Only/m);
});
```

- [ ] **Step 2: Run test to verify it fails only if the prompt drifted**

Run: `bun test ./extensions/subagents/subagents/profiles.test.ts`
Expected: PASS if `explorer.toml` already contains the exact Sage prompt; FAIL only if the file has drifted.

- [ ] **Step 3: Touch the asset only if required**

If the test fails, update `extensions/subagents/assets/agents/explorer.toml` so it contains the exact approved Sage prompt text and no Forge-mode wording.

If the test already passes, do not edit the asset. Just keep the stronger regression coverage.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ./extensions/subagents/subagents/profiles.test.ts`
Expected: PASS, confirming `explorer` is the sole surviving Sage path.

- [ ] **Step 5: Commit**

```bash
git add extensions/subagents/subagents/profiles.test.ts extensions/subagents/assets/agents/explorer.toml
 git commit -m "test: protect sage prompt in explorer profile"
```

## Task 5: Final integration verification and cleanup

**Files:**
- Modify as needed from previous tasks only

- [ ] **Step 1: Run focused tests for the changed surfaces**

Run:

```bash
bun test ./extensions/forge-content ./extensions/prompt-pack ./extensions/subagents ./extensions/settings
```

Expected: PASS for all changed suites, with no mode-related Forge tests left.

- [ ] **Step 2: Run the existing Codex suite to verify top-level tool-set switching still composes cleanly**

Run:

```bash
bun test ./extensions/codex-content
```

Expected: PASS, confirming Codex compatibility tools still work when `toolSet = codex`.

- [ ] **Step 3: Run package-wide verification**

Run:

```bash
bun run test
bun run lint
bun run typecheck
```

Expected:
- `bun run test`: PASS
- `bun run lint`: no new warnings or errors beyond any acknowledged pre-existing ones
- `bun run typecheck`: PASS

- [ ] **Step 4: Manually verify the user-visible flow in Pi**

Manual check:

1. Start Pi with this package loaded.
2. Run `/tungthedev tool-set forge`.
3. Send a prompt and confirm Forge tools are active.
4. Confirm `/forge`, `/sage`, `/muse`, `/forge-mode`, and `/forge-todos` are no longer available.
5. Create todos through `todo_write` and confirm the widget appears without any slash command.
6. Switch back with `/tungthedev tool-set codex`.
7. Confirm Codex tools are active again.
8. Spawn or inspect the `explorer` subagent and confirm it still uses the Sage research persona.

Expected: top-level `toolSet` switching works, Forge has no inner mode system, and Sage survives only through `explorer`.

- [ ] **Step 5: Commit final verification fixes**

```bash
git add extensions/forge-content extensions/prompt-pack extensions/subagents extensions/settings
 git commit -m "test: verify forge static tool set cleanup end to end"
```

## Notes For The Implementer

- Do not reintroduce a hidden Forge mode layer. The only surviving mode boundary is `tungthedev/pi.toolSet`.
- Prefer deleting dead abstractions over keeping compatibility wrappers for removed mode files.
- Keep tests high-value: command removal, static Forge tool preset, prompt cleanup, and Sage-in-explorer protection. Avoid low-signal snapshots.
- If the automated review loop still fails because the workspace references deleted `codex-subagents` paths, fix that workspace issue separately before relying on subagent-based verification.