# Remove Forge Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Forge mode and all Forge-specific assets from the package while migrating any persisted `toolSet: "forge"` state to Pi behavior.

**Architecture:** Shrink the shared tool-set model from four modes to three (`pi`, `codex`, `droid`), normalize legacy Forge values during config/session parsing, then remove the Forge extension tree and all remaining repo references. Keep the change safe by updating representative cross-mode tests before deleting implementation files that other code still imports.

**Tech Stack:** TypeScript, Bun test runner, Pi extension APIs, repo-level markdown docs

---

## File structure / change map

### Remove completely
- Delete: `extensions/forge-content/index.ts`
- Delete: `extensions/forge-content/index.test.ts`
- Delete: `extensions/forge-content/system-prompt.ts`
- Delete: `extensions/forge-content/system-prompt.test.ts`
- Delete: `extensions/forge-content/assets/forge-system.md`
- Delete: `extensions/forge-content/resources/discover.ts`
- Delete: `extensions/forge-content/resources/discover.test.ts`
- Delete: `extensions/forge-content/resources/skills/forge-research/SKILL.md`
- Delete: `extensions/forge-content/resources/skills/forge-review/SKILL.md`
- Delete: `extensions/forge-content/tools/index.ts`
- Delete: `extensions/forge-content/tools/fs-search.ts`
- Delete: `extensions/forge-content/tools/fs-search.test.ts`
- Delete: `extensions/forge-content/tools/patch.ts`
- Delete: `extensions/forge-content/tools/patch.test.ts`
- Delete: `extensions/forge-content/tools/followup.ts`
- Delete: `extensions/forge-content/tools/followup.test.ts`
- Delete: `extensions/forge-content/workflow/index.ts`
- Delete: `extensions/forge-content/workflow/index.test.ts`

### Shared mode plumbing
- Modify: `extensions/settings/config.ts`
- Modify: `extensions/settings/session.ts`
- Modify: `extensions/settings/ui.ts`
- Modify: `extensions/settings/index.ts`
- Modify: `extensions/settings/config.test.ts`
- Modify: `extensions/settings/index.test.ts`
- Modify: `extensions/shared/toolset-types.ts`
- Modify: `extensions/shared/toolset-registry.ts`
- Modify: `extensions/shared/toolset-resolver.test.ts`

### Remaining extensions that currently reference Forge
- Modify: `extensions/subagents/child-entry.ts`
- Modify: `extensions/subagents/interactive-child-entry.ts`
- Modify: `extensions/droid-content/tools/grep.ts`
- Modify: `extensions/droid-content/index.test.ts`
- Modify: `extensions/droid-content/system-prompt.test.ts`
- Modify: `extensions/codex-content/index.test.ts`
- Modify: `extensions/codex-content/system-prompt.test.ts`
- Modify: `extensions/editor/index.test.ts`

### Package/docs cleanup
- Modify: `package.json`
- Modify: `README.md`

### Verification targets
- Test: `extensions/settings/config.test.ts`
- Test: `extensions/settings/index.test.ts`
- Test: `extensions/shared/toolset-resolver.test.ts`
- Test: `extensions/codex-content/index.test.ts`
- Test: `extensions/codex-content/system-prompt.test.ts`
- Test: `extensions/droid-content/index.test.ts`
- Test: `extensions/droid-content/system-prompt.test.ts`
- Test: `extensions/editor/index.test.ts`
- Test: `extensions/subagents/index.test.ts` (only if prompt-hook removal affects it indirectly)

---

### Task 1: Remove Forge from settings domain and migrate legacy values to Pi

**Files:**
- Modify: `extensions/settings/config.ts`
- Modify: `extensions/settings/session.ts`
- Modify: `extensions/settings/ui.ts`
- Modify: `extensions/settings/index.ts`
- Test: `extensions/settings/config.test.ts`
- Test: `extensions/settings/index.test.ts`

- [ ] **Step 1: Write failing tests for Forge-to-Pi normalization and three-mode UX**

```ts
assert.deepEqual(parsePiModeSettings({ "pi-mode": { toolSet: "forge" } }), {
  toolSet: "pi",
  systemMdPrompt: false,
});

assert.equal(readSessionToolSet([
  { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "forge" } },
]), "pi");
```

Also update existing test arrays/unions so they only allow `"pi" | "codex" | "droid"`, and add/adjust a command/UI expectation that cycling moves `pi -> codex -> droid -> pi`.

- [ ] **Step 2: Run the targeted settings tests and confirm they fail first**

Run:
```bash
bun test ./extensions/settings/config.test.ts ./extensions/settings/index.test.ts
```

Expected: FAIL because current code still accepts/uses `forge` as a supported tool set.

- [ ] **Step 3: Implement the minimal settings/domain changes**

Update the mode domain and parsing code:

```ts
export type ToolSetPack = "pi" | "codex" | "droid";

function normalizeToolSet(value: unknown): ToolSetPack {
  if (value === "pi" || value === "codex" || value === "droid") {
    return value;
  }

  return DEFAULT_TOOL_SET;
}
```

Apply the same normalization principle in session parsing so legacy `forge` entries resolve as Pi instead of staying unsupported. Remove Forge from labels, picker values, help text, and cycle order.

- [ ] **Step 4: Re-run the targeted settings tests**

Run:
```bash
bun test ./extensions/settings/config.test.ts ./extensions/settings/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the settings migration slice**

```bash
git add extensions/settings/config.ts extensions/settings/session.ts extensions/settings/ui.ts extensions/settings/index.ts extensions/settings/config.test.ts extensions/settings/index.test.ts
git commit -m "refactor: remove forge from mode settings"
```

---

### Task 2: Remove Forge from the shared tool-set registry and representative resolver tests

**Files:**
- Modify: `extensions/shared/toolset-types.ts`
- Modify: `extensions/shared/toolset-registry.ts`
- Modify: `extensions/shared/toolset-resolver.test.ts`
- Modify: `extensions/codex-content/index.test.ts`
- Modify: `extensions/droid-content/index.test.ts`

- [ ] **Step 1: Write failing tests that assume only Pi/Codex/Droid remain**

Update the resolver expectations to remove Forge-only tools and mode assertions:

```ts
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
  "Task",
  "TaskOutput",
  "TaskStop",
]);
```

Remove Forge fixtures from shared tool lists where they are no longer needed, and replace the Droid test that currently asserts Forge mode behavior with a remaining-mode contract that matters.

- [ ] **Step 2: Run the shared-mode tests and confirm they fail first**

Run:
```bash
bun test ./extensions/shared/toolset-resolver.test.ts ./extensions/codex-content/index.test.ts ./extensions/droid-content/index.test.ts
```

Expected: FAIL because the shared registry still defines `forge` contributions and tests still reference Forge.

- [ ] **Step 3: Implement the registry simplification**

Delete Forge entries from the shared registry and mode order:

```ts
export const TOOLSET_MODE_ORDER = {
  pi: ["piBuiltins", "web", "skill", "subagentsTask"],
  codex: ["shell", "read", "web", "skill", "codexContent", "subagentsCodex"],
  droid: ["read", "droidContent", "web", "skill", "subagentsTask"],
} satisfies Record<ToolsetModeId, readonly (keyof typeof TOOLSET_CONTRIBUTIONS)[]>;
```

Remove the Forge conflict rules and any Forge-only tool fixtures from remaining tests unless the test still needs them to prove hiding behavior.

- [ ] **Step 4: Re-run the shared-mode tests**

Run:
```bash
bun test ./extensions/shared/toolset-resolver.test.ts ./extensions/codex-content/index.test.ts ./extensions/droid-content/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shared-registry slice**

```bash
git add extensions/shared/toolset-types.ts extensions/shared/toolset-registry.ts extensions/shared/toolset-resolver.test.ts extensions/codex-content/index.test.ts extensions/droid-content/index.test.ts
git commit -m "refactor: remove forge from shared toolset registry"
```

---

### Task 3: Remove direct runtime dependencies on Forge implementation files

**Files:**
- Modify: `extensions/droid-content/tools/grep.ts`
- Modify: `extensions/subagents/child-entry.ts`
- Modify: `extensions/subagents/interactive-child-entry.ts`
- Test: `extensions/droid-content/system-prompt.test.ts`
- Test: `extensions/codex-content/system-prompt.test.ts`
- Test: `extensions/subagents/index.test.ts` (run if import cleanup touches shared startup behavior)

- [ ] **Step 1: Write failing tests/fixtures that stop referring to Forge as an alternate mode**

Replace non-selected-mode fixtures like this:

```ts
function createContext(toolSet: "pi" | "codex" | "droid") {
  return {
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  };
}
```

Also change the Codex and Droid prompt tests so the “returns no-op when not selected” case uses `pi` rather than `forge`.

- [ ] **Step 2: Run the affected prompt/import tests and confirm they fail first**

Run:
```bash
bun test ./extensions/codex-content/system-prompt.test.ts ./extensions/droid-content/system-prompt.test.ts
```

Expected: FAIL where type unions or fixtures still mention Forge.

- [ ] **Step 3: Remove the runtime imports on Forge code**

For subagents, delete the Forge prompt registration:

```ts
export default function codexChildEntry(pi: ExtensionAPI) {
  codexContent(pi);
  systemMd(pi);
}
```

For Droid grep, stop importing `buildFsSearchArgs` from `forge-content`. Either move the small ripgrep arg builder into Droid/local shared code or inline only the behavior Droid Grep needs so deleting Forge does not break Droid search.

- [ ] **Step 4: Re-run the affected tests**

Run:
```bash
bun test ./extensions/codex-content/system-prompt.test.ts ./extensions/droid-content/system-prompt.test.ts ./extensions/subagents/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the runtime-decoupling slice**

```bash
git add extensions/droid-content/tools/grep.ts extensions/subagents/child-entry.ts extensions/subagents/interactive-child-entry.ts extensions/codex-content/system-prompt.test.ts extensions/droid-content/system-prompt.test.ts extensions/subagents/index.test.ts
git commit -m "refactor: decouple remaining modes from forge runtime"
```

---

### Task 4: Delete the Forge extension tree and remove package registration/docs references

**Files:**
- Delete: `extensions/forge-content/**`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `extensions/editor/index.test.ts`

- [ ] **Step 1: Write/adjust the last failing reference tests before deletion**

Replace the editor fixture tokens with a non-Forge skill example so the test still protects `$skill` behavior without pinning Forge branding:

```ts
return {
  prefix: "/skill:sys",
  items: [{ value: "skill:systematic-debugging", label: "skill:systematic-debugging" }],
};
```

Expected completion result:

```ts
{
  lines: ["use /skill:systematic-debugging "],
  cursorLine: 0,
  cursorCol: "use /skill:systematic-debugging ".length,
}
```

- [ ] **Step 2: Run the editor/package-adjacent test before deletion**

Run:
```bash
bun test ./extensions/editor/index.test.ts
```

Expected: FAIL while the test still references Forge-specific skill names.

- [ ] **Step 3: Delete Forge and clean package/docs references**

Apply all of the following in one slice:

- remove `./extensions/forge-content/index.ts` from `package.json`
- remove `forge-content` from the package description and keywords if present
- remove `./extensions/forge-content` from the `bun test` script
- remove Forge bullets from `README.md`
- delete the full `extensions/forge-content` directory tree

- [ ] **Step 4: Re-run the editor test plus a repo-wide Forge search**

Run:
```bash
bun test ./extensions/editor/index.test.ts
rg -n "forge|Forge" README.md package.json extensions
```

Expected: editor test PASS; search output should only show intentional historical strings if any remain. If search finds live code/docs references, remove them before proceeding.

- [ ] **Step 5: Commit the deletion/documentation slice**

```bash
git add package.json README.md extensions/editor/index.test.ts
git add -u extensions/forge-content
git commit -m "refactor: remove forge extension and docs"
```

---

### Task 5: Full verification and cleanup of remaining Forge references

**Files:**
- Verify all modified files from Tasks 1-4
- Optionally modify any straggler files found by the final search

- [ ] **Step 1: Run a final repo-wide Forge reference search**

Run:
```bash
rg -n "forge|Forge" . --glob '!docs/superpowers/**'
```

Expected: no live product code/docs references remain. If matches remain in user-approved design/plan docs under `docs/superpowers/**`, they are acceptable.

- [ ] **Step 2: Run typecheck**

Run:
```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the targeted affected test set**

Run:
```bash
bun test \
  ./extensions/settings/config.test.ts \
  ./extensions/settings/index.test.ts \
  ./extensions/shared/toolset-resolver.test.ts \
  ./extensions/codex-content/index.test.ts \
  ./extensions/codex-content/system-prompt.test.ts \
  ./extensions/droid-content/index.test.ts \
  ./extensions/droid-content/system-prompt.test.ts \
  ./extensions/editor/index.test.ts \
  ./extensions/subagents/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full suite if the targeted set is clean**

Run:
```bash
bun run test
```

Expected: PASS, or if unrelated pre-existing failures appear, capture them explicitly before claiming completion.

- [ ] **Step 5: Commit any final cleanup**

```bash
git add -A
git commit -m "test: verify forge mode removal"
```

---

## Notes for the implementer

- Keep the migration behavior simple: `forge` should not remain a valid mode anywhere, but old persisted values must resolve to Pi without errors.
- Do not preserve hidden Forge compatibility branches unless a remaining test proves they are still necessary.
- Follow repo testing guidance: keep representative behavior tests, remove low-value Forge-only coverage that no longer protects live behavior.
- The working tree already contains unrelated edits. Avoid staging unrelated files during each commit.
