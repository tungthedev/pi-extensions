# Subagents TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old text `/subagents` command and Codex/TOML role management with a TUI-first role manager backed by `pi-subagents`-style markdown roles in user/project scope.

**Architecture:** Split the work into two layers. First, introduce a cwd-aware markdown role store that becomes the single source of truth for builtin, user, and project role resolution at runtime. Then add a slim overlay manager that reuses `pi-subagents` TUI patterns for list/detail/edit flows while keeping scope limited to role fields (`name`, `description`, `prompt`, `model`, `thinking`) and builtin shadowing via same-name custom files.

**Tech Stack:** TypeScript, Bun test runner, Pi extension command/UI APIs, `@mariozechner/pi-tui`, markdown frontmatter parsing/serialization.

---

## Required reference reading from `../pi-subagents`

Before implementing, read these files to borrow structure and interaction patterns deliberately rather than improvising:

- `../pi-subagents/README.md` — especially the **Agents** section for markdown format and scope/discovery expectations
- `../pi-subagents/agents.ts` — discovery, scope handling, and serialization-adjacent contracts
- `../pi-subagents/agent-serializer.ts` — markdown frontmatter serialization shape
- `../pi-subagents/agent-manager.ts` — overall overlay state machine
- `../pi-subagents/agent-manager-list.ts` — searchable list behavior
- `../pi-subagents/agent-manager-detail.ts` — detail view behavior
- `../pi-subagents/agent-manager-edit.ts` — edit/model/thinking picker behavior
- `../pi-subagents/text-editor.ts` — text editor primitives

Port patterns, not full feature scope. Do **not** bring over chains, tools/skills editors, or broad agent settings beyond `name`, `description`, `prompt`, `model`, and `thinking`.

## File Structure / Responsibilities

**Create:** `extensions/subagents/subagents/roles-types.ts`
- Define layered role records, effective role records, source types, warnings, and save input/output shapes.

**Create:** `extensions/subagents/subagents/roles-builtins.ts`
- Load builtin roles from markdown assets and expose layered/effective builtin definitions.

**Create:** `extensions/subagents/subagents/roles-serializer.ts`
- Parse/serialize markdown role files with frontmatter fields:
  - `name`
  - `description`
  - `model`
  - `thinking`
  - markdown body as prompt
- Enforce filename/frontmatter name alignment.

**Create:** `extensions/subagents/subagents/roles-discovery.ts`
- Resolve user/project role directories from cwd.
- Build both:
  - layered definitions for TUI
  - effective-by-name map for runtime
- Detect legacy Codex/TOML role files and legacy `~/.pi/agent/agents` usage and emit warnings without loading them.
- Export a single project-scope resolution helper reused by both discovery and storage so read/write semantics cannot drift.

**Create:** `extensions/subagents/subagents/roles-storage.ts`
- Save, rename, and delete custom markdown role files.
- Validate scope, collisions, and builtin override creation.
- Accept `cwd` and reuse the exact same nearest-project `.agents` resolver as discovery for project-scope create/save/rename.

**Modify:** `extensions/subagents/subagents/profiles-types.ts`
- Replace Codex-specific source/locking types with markdown role-backed runtime profile types.

**Modify:** `extensions/subagents/subagents/profiles-builtins.ts`
- Replace TOML asset parsing with markdown builtin loading or delete in favor of `roles-builtins.ts`.
- Eliminate the current split where names/descriptions live in code and prompt/model data live in assets. After migration, builtin role metadata should come from one markdown-backed source of truth.

**Modify:** `extensions/subagents/subagents/profiles-loader.ts`
- Remove Codex loader logic; either delete file or turn it into thin markdown-role adapter if keeping API surface helps minimize churn.

**Modify:** `extensions/subagents/subagents/profiles.ts`
- Switch runtime resolver to markdown role store.
- Make resolution cwd-aware.
- Ensure tool-facing role descriptions use the same resolver.

**Modify:** `extensions/subagents/subagents/index.ts`
- Update actual spawn/bootstrap/attach/resume call sites to use the cwd-aware markdown resolver instead of a static/global Codex-era profile lookup.

**Modify:** `extensions/subagents/subagents/lifecycle-service.ts`
- Update fresh-spawn profile selection to use the cwd-aware markdown resolver.
- Keep lifecycle spawn behavior aligned with `/subagents`, runtime attach/resume, and tool-facing role descriptions.

**Modify:** `extensions/subagents/subagents/profiles-apply.ts`
- Remove locked-model / locked-reasoning behavior.
- Apply effective role model/thinking defaults plus explicit runtime overrides.

**Modify:** `extensions/subagents/subagents/tool-adapters-task.ts`
- Build Task tool role descriptions from the cwd-aware markdown resolver.
- Replace current registration-time static role text with a refreshable or dynamically generated path that cannot go stale across cwd changes.

**Modify:** `extensions/subagents/subagents/tool-adapters-codex.ts`
- Build `spawn_agent` role descriptions from the cwd-aware markdown resolver.
- Replace current registration-time static role text with a refreshable or dynamically generated path that cannot go stale across cwd changes.

**Modify:** `extensions/subagents/commands.ts`
- Remove old text parser/CRUD implementation.
- Register a TUI-only `/subagents` command.
- Return a helpful non-UI message when no TUI is available.
- Surface legacy-migration warnings to the user when the manager opens.

**Create:** `extensions/subagents/ui/subagents-manager.ts`
- Overlay controller/screen switching logic.

**Create:** `extensions/subagents/ui/subagents-list.ts`
- Searchable layered list + create row.

**Create:** `extensions/subagents/ui/subagents-detail.ts`
- Detail rendering + key handling for readonly builtin/custom role views.

**Create:** `extensions/subagents/ui/subagents-edit.ts`
- Name/description/prompt/model/thinking editing flows.
- Scope picker, model picker, thinking picker, delete confirm.

**Create:** `extensions/subagents/ui/text-editor.ts`
- Minimal reusable text editor logic copied/adapted from `../pi-subagents/text-editor.ts`.

**Create:** `extensions/subagents/subagents/legacy-role-warnings.ts`
- Deduplicate and surface breaking-change migration warnings once per session or once per manager open, with explicit guidance to move custom roles into `~/.agents` or project `.agents/`.

**Modify if needed:** `extensions/subagents/index.ts`
- Keep command registration intact while new `/subagents` command launches the manager.

**Create builtin markdown assets:**
- `extensions/subagents/assets/agents/default.md`
- `extensions/subagents/assets/agents/delegate.md`
- `extensions/subagents/assets/agents/planner.md`
- `extensions/subagents/assets/agents/researcher.md`
- `extensions/subagents/assets/agents/reviewer.md`
- `extensions/subagents/assets/agents/scout.md`

**Delete after migration (only after markdown replacements are wired and tests pass):**
- `extensions/subagents/assets/agents/*.toml`
- any dead Codex-specific role helpers no longer referenced

**Modify:** `CHANGELOG.md`
- Note the intentional breaking change: `/subagents` is now TUI-first and Codex/TOML-managed custom roles are no longer loaded.

**Tests:**
- Create: `extensions/subagents/subagents/roles.test.ts`
- Modify: `extensions/subagents/subagents/profiles.test.ts`
- Modify: `extensions/subagents/commands.test.ts`
- Modify: `extensions/subagents/index.test.ts`
- Create if useful and cheap: `extensions/subagents/ui/subagents-manager.test.ts`

---

## Task 1: Build the markdown role store and lock down its contracts

**Files:**
- Create: `extensions/subagents/subagents/roles-types.ts`
- Create: `extensions/subagents/subagents/roles-builtins.ts`
- Create: `extensions/subagents/subagents/roles-serializer.ts`
- Create: `extensions/subagents/subagents/roles-discovery.ts`
- Create: `extensions/subagents/subagents/roles-storage.ts`
- Create: `extensions/subagents/subagents/roles.test.ts`
- Create: `extensions/subagents/assets/agents/default.md`
- Create: `extensions/subagents/assets/agents/delegate.md`
- Create: `extensions/subagents/assets/agents/planner.md`
- Create: `extensions/subagents/assets/agents/researcher.md`
- Create: `extensions/subagents/assets/agents/reviewer.md`
- Create: `extensions/subagents/assets/agents/scout.md`
- Keep temporarily during task: `extensions/subagents/assets/agents/default.toml`
- Keep temporarily during task: `extensions/subagents/assets/agents/delegate.toml`
- Keep temporarily during task: `extensions/subagents/assets/agents/planner.toml`
- Keep temporarily during task: `extensions/subagents/assets/agents/researcher.toml`
- Keep temporarily during task: `extensions/subagents/assets/agents/reviewer.toml`
- Keep temporarily during task: `extensions/subagents/assets/agents/scout.toml`

- [ ] **Step 1: Write the failing tests**

Add `extensions/subagents/subagents/roles.test.ts` covering the highest-risk contracts. While writing the implementation, keep `../pi-subagents/agents.ts` and `../pi-subagents/agent-serializer.ts` open as the reference baseline for discovery and markdown shape:

```ts
test("layered discovery keeps builtin, user, and project definitions for the same name", () => {
  // create reviewer in builtin asset set, ~/.agents, and nearest .agents
  // assert layered entries keep all 3
  // assert effective role for reviewer is project
});

test("serializer round-trips markdown role frontmatter and prompt body", () => {
  const raw = `---\nname: reviewer\ndescription: Review changes\nmodel: openai/gpt-5\nthinking: high\n---\n\nPrompt\n`;
  const parsed = parseMarkdownRole(raw, "/tmp/reviewer.md");
  assert.equal(parsed.name, "reviewer");
  assert.equal(serializeMarkdownRole(parsed).includes("model: openai/gpt-5"), true);
});

test("renaming a custom role changes the file path and rejects same-scope collisions", () => {
  // save role, rename it, assert <name>.md moved
});

test("loader rejects or normalizes filename/frontmatter name mismatches", () => {
  // write .agents/reviewer.md with frontmatter name: scout
  // assert warning or rejection contract, and no ambiguous effective role is loaded
});

test("legacy Codex files and legacy ~/.pi/agent/agents emit warnings but are not loaded", () => {
  // create .codex/config.toml + agents/reviewer.toml and a legacy ~/.pi/agent/agents file
  // assert warning present, assert effective roles omit both legacy sources
});

test("project-scope save uses the same nearest-.agents resolver as discovery", () => {
  // create nested cwd under project root
  // save project role from nested cwd
  // assert file lands in nearest ancestor .agents, not cwd/.agents
});
```

- [ ] **Step 2: Run targeted tests to verify failure**

Run:
```bash
bun test ./extensions/subagents/subagents/roles.test.ts
```
Expected: FAIL because the markdown role store does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement the role store with two outputs:

```ts
export type ResolvedRoleSet = {
  layered: LayeredRoleRecord[];
  effective: Map<string, EffectiveRoleRecord>;
  warnings: string[];
};
```

Parsing/serialization contract:

```ts
export type MarkdownRole = {
  name: string;
  description: string;
  model?: string;
  thinking?: "minimal" | "low" | "medium" | "high" | "xhigh";
  prompt: string;
  filePath: string;
  source: "builtin" | "user" | "project";
};
```

Keep discovery rules simple and explicit:
- user roles from `~/.agents`
- project roles from nearest `.agents` walking upward from cwd
- builtin roles from markdown assets
- precedence: `project > user > builtin`
- warnings for legacy Codex/TOML detection and legacy `~/.pi/agent/agents` detection; do not load either legacy source

For builtin roles, use one markdown-backed source of truth for the builtin set, descriptions, model, thinking, and prompt body. Add a parity test for the expected builtin names:
```ts
assert.deepEqual([...builtinNames], ["default", "delegate", "planner", "researcher", "reviewer", "scout"]);
```

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:
```bash
bun test ./extensions/subagents/subagents/roles.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

Do not delete the TOML builtin assets yet; keep the replacement markdown assets staged first so the next migration task can switch readers safely.

```bash
git add extensions/subagents/subagents/roles-types.ts extensions/subagents/subagents/roles-builtins.ts extensions/subagents/subagents/roles-serializer.ts extensions/subagents/subagents/roles-discovery.ts extensions/subagents/subagents/roles-storage.ts extensions/subagents/subagents/roles.test.ts extensions/subagents/assets/agents/*.md
git commit -m "feat: add markdown-backed subagent role store"
```

---

## Task 2: Switch runtime role resolution and tool-facing descriptions to the markdown store

**Files:**
- Modify: `extensions/subagents/subagents/profiles-types.ts`
- Modify: `extensions/subagents/subagents/profiles-builtins.ts`
- Modify: `extensions/subagents/subagents/profiles-loader.ts`
- Modify: `extensions/subagents/subagents/profiles.ts`
- Modify: `extensions/subagents/subagents/profiles-apply.ts`
- Modify: `extensions/subagents/subagents/tool-adapters-task.ts`
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/index.ts`
- Modify: `extensions/subagents/subagents/lifecycle-service.ts`
- Modify: `extensions/subagents/subagents/profiles.test.ts`

- [ ] **Step 1: Write the failing tests**

Trim the old Codex tests and replace them with runtime-facing tests. While implementing, inspect these current runtime call sites explicitly so none are missed:
- `extensions/subagents/subagents/lifecycle-service.ts`
- `extensions/subagents/subagents/index.ts`
- `extensions/subagents/subagents/tool-adapters-task.ts`
- `extensions/subagents/subagents/tool-adapters-codex.ts`

```ts
test("resolveAgentProfiles uses cwd-aware project shadowing", () => {
  // create ~/.agents/reviewer.md and nested project .agents/reviewer.md
  // resolve from nested cwd
  // assert effective reviewer is project
});

test("buildSpawnAgentTypeDescription reflects markdown roles for the active cwd", () => {
  // assert description includes project override, not stale builtin-only data
});

test("tool-facing role descriptions refresh when cwd changes", () => {
  // simulate two different cwd contexts and assert exposed role text does not stay stuck on the first one
});

test("applySpawnAgentProfile uses role defaults and explicit overrides without locking", () => {
  // role model/thinking become defaults, but explicit request still wins
});
```

- [ ] **Step 2: Run targeted tests to verify failure**

Run:
```bash
bun test ./extensions/subagents/subagents/profiles.test.ts
```
Expected: FAIL because the runtime resolver still assumes Codex/TOML roles and static caching.

- [ ] **Step 3: Write minimal implementation**

Update runtime profile resolution to adapt markdown roles into the existing spawn pipeline:

```ts
export type AgentProfileSource = "builtin" | "user" | "project";

export type AgentProfileConfig = {
  name: string;
  description?: string;
  developerInstructions?: string;
  model?: string;
  reasoningEffort?: string;
  source: AgentProfileSource;
  sourcePath?: string;
  visible: boolean;
  available: true;
};
```

Implementation rules:
- `developerInstructions` comes from markdown body
- `reasoningEffort` is derived from saved `thinking`
- remove `lockedModel` / `lockedReasoningEffort`
- cache by cwd/project root, or keep resolver uncached until the new behavior is stable
- update the actual spawn/resume/bootstrap paths in both `subagents/index.ts` and `subagents/lifecycle-service.ts` so runtime execution uses the same active-cwd resolution as the tool descriptions and `/subagents`
- because tool role descriptions are currently computed once at registration time, add an explicit refresh strategy in this task:
  - either re-register/refresh the tool descriptions on `session_start` and `before_agent_start` in `extensions/subagents/index.ts`, or
  - move role-list text generation behind an active-cwd lookup path that is evaluated per relevant context rather than once at extension init
- do not leave any registration-time static role list that can go stale after cwd changes

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:
```bash
bun test ./extensions/subagents/subagents/profiles.test.ts ./extensions/subagents/index.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

After this task passes, remove the now-dead builtin TOML assets and any unreferenced Codex role helpers/exports in the same commit so the repository never sits in a half-migrated asset state.

```bash
git add extensions/subagents/subagents/profiles-types.ts extensions/subagents/subagents/profiles-builtins.ts extensions/subagents/subagents/profiles-loader.ts extensions/subagents/subagents/profiles.ts extensions/subagents/subagents/profiles-apply.ts extensions/subagents/subagents/tool-adapters-task.ts extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/index.ts extensions/subagents/subagents/lifecycle-service.ts extensions/subagents/subagents/profiles.test.ts extensions/subagents/index.test.ts extensions/subagents/assets/agents
git commit -m "refactor: resolve subagent profiles from markdown roles"
```

---

## Task 3: Replace the old `/subagents` text command with a TUI entrypoint

**Files:**
- Modify: `extensions/subagents/commands.ts`
- Modify: `extensions/subagents/commands.test.ts`
- Modify only if needed: `extensions/subagents/index.ts`

- [ ] **Step 1: Write the failing tests**

Replace text-parser tests with command entry tests:

```ts
test("/subagents opens a custom overlay when UI is available", async () => {
  // ctx.hasUI = true
  // assert ctx.ui.custom called once
});

test("/subagents returns a helpful message when UI is unavailable", async () => {
  // ctx.hasUI = false
  // assert sendMessage contains 'requires the interactive UI'
});
```

Keep only behavior-focused coverage; delete parser/TOML CRUD assertions.

- [ ] **Step 2: Run targeted tests to verify failure**

Run:
```bash
bun test ./extensions/subagents/commands.test.ts
```
Expected: FAIL because `commands.ts` still exposes the text parser and Codex/TOML CRUD path.

- [ ] **Step 3: Write minimal implementation**

Add a temporary stub manager function only if needed so `commands.ts` can compile before the full TUI arrives. Bound the stub tightly:
- it should only preserve the import/API boundary
- it should not introduce placeholder screen logic, storage logic, or alternate UX
- all actual overlay behavior belongs in Task 4

Keep the user-facing behavior behind the final `/subagents` entrypoint contract.

Rewrite `registerSubagentsCommand()` to do only two things:

```ts
if (!ctx.hasUI) {
  pi.sendMessage({ content: "# Subagents\n\n`/subagents` requires the interactive UI.", display: true }, { deliverAs: "nextTurn" });
  return;
}

await openSubagentsManager(pi, ctx);
```

Delete:
- `parseSubagentsCommand`
- old list/create/update/delete/help handlers
- Codex-specific command helpers

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:
```bash
bun test ./extensions/subagents/commands.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extensions/subagents/commands.ts extensions/subagents/commands.test.ts extensions/subagents/index.ts
git commit -m "feat: replace text subagents command with tui entrypoint"
```

---

## Task 4: Port the slim role manager TUI for list/detail/edit/create/delete flows

**Files:**
- Create: `extensions/subagents/ui/subagents-manager.ts`
- Create: `extensions/subagents/ui/subagents-list.ts`
- Create: `extensions/subagents/ui/subagents-detail.ts`
- Create: `extensions/subagents/ui/subagents-edit.ts`
- Create: `extensions/subagents/ui/text-editor.ts`
- Create if useful and cheap: `extensions/subagents/ui/subagents-manager.test.ts`
- Modify: `extensions/subagents/commands.ts`

- [ ] **Step 1: Write the failing tests**

If testable cheaply, add reducer/handler-level tests rather than brittle full-render snapshots:

```ts
test("list handler opens detail for the highlighted role", () => {
  // enter on layered reviewer row -> open-detail action
});

test("builtin edit flow requests override scope instead of mutating builtin", () => {
  // 'e' on builtin reviewer -> create-override action
});

test("delete confirm is only available for custom roles", () => {
  // builtin -> disabled, user/project -> confirm state
});

test("manual model entry rejects bare model ids", () => {
  // gpt-5 => inline error
  // openai/gpt-5 => accepted
});
```

If UI-unit tests are too noisy, keep tests focused on command harness + storage and verify the UI manually during the final verification pass.

- [ ] **Step 2: Run targeted tests to verify failure**

Run one of:
```bash
bun test ./extensions/subagents/ui/subagents-manager.test.ts
```
or, if no UI-unit tests are kept,
```bash
bun test ./extensions/subagents/commands.test.ts ./extensions/subagents/subagents/roles.test.ts
```
Expected: FAIL because the manager files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Port only the `pi-subagents` patterns that matter. Keep these reference files open while implementing the UI:
- `../pi-subagents/agent-manager.ts`
- `../pi-subagents/agent-manager-list.ts`
- `../pi-subagents/agent-manager-detail.ts`
- `../pi-subagents/agent-manager-edit.ts`
- `../pi-subagents/text-editor.ts`
- searchable list
- detail screen with scrollable prompt
- edit screen for:
  - `name` (custom only)
  - `description`
  - `prompt`
  - `model`
  - `thinking`
- model picker from Pi's command-context model registry when available (`ctx.modelRegistry.getAvailable()`; see local Pi example usage in `node_modules/@mariozechner/pi-coding-agent/examples/extensions/preset.ts`)
- manual model entry fallback requiring `provider/model`; treat this fallback as first-class so the TUI is still complete even if model enumeration is unavailable or awkward in this command context
- builtin `e`/`m` => choose scope, create same-name override, then edit custom copy
- delete confirmation for user/project files only
- `Create new subagent` row => scope picker -> editor -> save -> refresh -> open detail

Useful starting shape:

```ts
export type ManagerScreen =
  | "list"
  | "detail"
  | "edit"
  | "model-picker"
  | "thinking-picker"
  | "scope-picker"
  | "confirm-delete";
```

Keep the TUI role-only. Do not import chains/tools/skills/parallel-builder behavior from `../pi-subagents`.

- [ ] **Step 4: Run focused tests / smoke checks**

Run:
```bash
bun test ./extensions/subagents/commands.test.ts ./extensions/subagents/subagents/roles.test.ts ./extensions/subagents/subagents/profiles.test.ts
```
Expected: PASS

Then do one manual smoke check in Pi:
- `/subagents`
- search for `reviewer`
- open builtin reviewer
- press `e`
- choose user scope
- save override with same name
- reopen and verify custom row is effective

- [ ] **Step 5: Commit**

```bash
git add extensions/subagents/ui/subagents-manager.ts extensions/subagents/ui/subagents-list.ts extensions/subagents/ui/subagents-detail.ts extensions/subagents/ui/subagents-edit.ts extensions/subagents/ui/text-editor.ts extensions/subagents/commands.ts extensions/subagents/commands.test.ts
git commit -m "feat: add subagents role manager tui"
```

---

## Task 5: Final cleanup, migration warnings, and repo-level verification

**Files:**
- Modify: `extensions/subagents/subagents/roles-discovery.ts`
- Modify: `extensions/subagents/subagents/legacy-role-warnings.ts`
- Modify: `extensions/subagents/subagents/roles.test.ts`
- Modify: `extensions/subagents/subagents/profiles.test.ts`
- Modify: `extensions/subagents/index.test.ts`
- Modify: `CHANGELOG.md`
- Modify any touched files to remove dead Codex helpers/imports

- [ ] **Step 1: Add the last high-value tests**

Ensure tests cover:
- legacy Codex warning emitted, surfaced to the user with explicit migration guidance (`~/.agents` / project `.agents`), and no legacy role loading occurs
- legacy `~/.pi/agent/agents` detection follows the same warning/no-load behavior
- deleting project override reveals user override before builtin
- builtin rows remain visible even when shadowed
- Task/`spawn_agent` role descriptions follow cwd-aware project resolution and refresh when cwd changes

- [ ] **Step 2: Run the focused subagents suite**

Run:
```bash
bun test ./extensions/subagents
```
Expected: PASS

- [ ] **Step 3: Run typecheck and lint for the touched area**

Run:
```bash
bun run typecheck
bun run lint
```
Expected: PASS

- [ ] **Step 4: Run the full verification command required by this repo**

Run:
```bash
bun run test && bun run lint && bun run typecheck
```
Expected: PASS

- [ ] **Step 5: Commit final cleanup**

Include the changelog note in the final cleanup commit.

```bash
git add extensions/subagents CHANGELOG.md
git commit -m "refactor: remove codex role management from subagents"
```

---

## Notes for the implementer

- Reuse `../pi-subagents` interaction patterns, not its full feature set.
- Keep `../pi-subagents/README.md`, `agents.ts`, `agent-serializer.ts`, `agent-manager.ts`, `agent-manager-list.ts`, `agent-manager-detail.ts`, `agent-manager-edit.ts`, and `text-editor.ts` open while implementing; those are the standard references for this work.
- Prefer cheap, behavior-focused tests over snapshot-heavy UI tests.
- Keep runtime resolution and UI resolution on the same markdown role store; do not maintain parallel truth sources.
- Treat the Codex/TOML removal as an intentional breaking change. Warn clearly when legacy files are present, but do not load them.
- Do not widen field scope beyond `name`, `description`, `prompt`, `model`, and `thinking`.
