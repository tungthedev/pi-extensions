# Shared Todos Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Forge's todo workflow into a shared `extensions/todos/` module, use it as `todos_write` / `todos_read` in Forge, and replace Codex's old plan workflow with the same shared todo behavior exposed as `update_plan` / `read_plan`.

**Architecture:** Move the current Forge todo implementation into a shared registration layer with configurable tool names, labels, prompt guidance, and session-history reconstruction keyed by the configured write-tool name. Forge and Codex become thin integration layers that supply aliases and prompt text, while Codex keeps `request_user_input` as-is and drops the old plan-specific implementation.

**Tech Stack:** TypeScript, Bun tests, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`

---

## File Structure

### Create
- `extensions/todos/index.ts` — shared public exports for todo workflow registration and state helpers.
- `extensions/todos/todo-tools.ts` — configurable registration for write/read todo tools plus session reconstruction.
- `extensions/todos/todo-state.ts` — shared todo snapshot types, normalization, update rules, formatting helpers.
- `extensions/todos/todo-widget.ts` — shared compact widget rendering and visibility logic.
- `extensions/todos/todo-state.test.ts` — shared state tests moved from Forge.
- `extensions/todos/todo-tools.test.ts` — shared tool rendering and widget tests moved from Forge and extended for aliasing.

### Modify
- `extensions/forge-content/workflow/index.ts` — consume shared todo registration using Forge aliases.
- `extensions/forge-content/index.ts` — update active tool list to `todos_write` / `todos_read`.
- `extensions/forge-content/prompt/forge-system.md` — update tool references and examples to new Forge names.
- `extensions/codex-content/workflow/index.ts` — remove old plan registration and register shared todos as `update_plan` / `read_plan` while preserving `request_user_input`.
- `extensions/codex-content/workflow/types.ts` — remove plan-specific exports/constants and keep only request-user-input related exports/constants still needed.
- `extensions/codex-content/tools/index.ts` — update tool-name allowlist/compatibility logic for the new Codex aliases.
- `package.json` — include `./extensions/todos` in the test script if shared tests live there.

### Remove or Reduce to Thin Re-exports
- `extensions/forge-content/workflow/todo-tools.ts`
- `extensions/forge-content/workflow/todo-state.ts`
- `extensions/forge-content/workflow/todo-widget.ts`
- `extensions/forge-content/workflow/todo-tools.test.ts`
- `extensions/forge-content/workflow/todo-state.test.ts`
- `extensions/codex-content/workflow/plan.ts`
- `extensions/codex-content/workflow/plan.test.ts`

Prefer deletion if no callers remain. If temporary wrappers are needed for a small migration step, remove them by the end of the plan.

---

### Task 1: Create the shared todos module skeleton

**Files:**
- Create: `extensions/todos/index.ts`
- Create: `extensions/todos/todo-state.ts`
- Create: `extensions/todos/todo-widget.ts`
- Create: `extensions/todos/todo-tools.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing shared state test file**

Create `extensions/todos/todo-state.test.ts` by copying the current Forge state expectations into the new location.

- [ ] **Step 2: Run the new shared state test to verify it fails**

Run:
```bash
bun test ./extensions/todos/todo-state.test.ts
```
Expected: FAIL because `extensions/todos/todo-state.ts` does not exist yet.

- [ ] **Step 3: Create the minimal shared state module**

Implement `extensions/todos/todo-state.ts` with the current Forge behavior:
- todo statuses
- snapshot types
- `normalizeTodoContent`
- `applyForgeTodoUpdates`-equivalent logic (rename generically if cleaner)
- summary formatting
- snapshot restoration

Keep behavior identical to the current Forge version.

- [ ] **Step 4: Re-run the shared state test to verify it passes**

Run:
```bash
bun test ./extensions/todos/todo-state.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add shared public exports**

Create `extensions/todos/index.ts` exporting the shared registration function and any types/helpers needed by consuming extensions.

- [ ] **Step 6: Update package test coverage for the new folder**

Modify `package.json` to include `./extensions/todos` in the root `test` script so shared tests are not skipped by the normal verification flow.

- [ ] **Step 7: Commit the shared skeleton**

```bash
git add extensions/todos/index.ts extensions/todos/todo-state.ts extensions/todos/todo-state.test.ts package.json
git commit -m "refactor: add shared todos state module"
```

### Task 2: Move widget and tool behavior into the shared module with configurable aliases

**Files:**
- Create: `extensions/todos/todo-widget.ts`
- Create: `extensions/todos/todo-tools.ts`
- Create: `extensions/todos/todo-tools.test.ts`
- Reference: `extensions/forge-content/workflow/todo-tools.ts`
- Reference: `extensions/forge-content/workflow/todo-widget.ts`

- [ ] **Step 1: Write the failing shared tool tests**

Create `extensions/todos/todo-tools.test.ts` covering:
- compact write-call rendering
- compact write-result rendering
- all-complete fallback message
- read rendering
- widget visibility rules
- reminder text in tool response content
- alias registration (write/read tool names configurable)

- [ ] **Step 2: Run the shared tool tests to verify they fail**

Run:
```bash
bun test ./extensions/todos/todo-tools.test.ts
```
Expected: FAIL because shared tool registration is not implemented yet.

- [ ] **Step 3: Implement shared widget behavior**

Create `extensions/todos/todo-widget.ts` with the current compact widget behavior:
- clear status segment
- show one above-editor widget only when an item is `in_progress`
- format `Todos [completed/total]: <running task>`

Make status/widget keys configurable so Forge and Codex do not share UI slots accidentally.

- [ ] **Step 4: Implement shared configurable tool registration**

Create `extensions/todos/todo-tools.ts` with a registration API like:
- write tool name
- read tool name
- write/read render-call labels
- prompt snippets/guidelines
- descriptions
- widget/status keys

Requirements:
- preserve Forge todo input shape (`{ todos: [...] }`)
- reconstruct from tool results using the configured write-tool name, not a hardcoded `todo_write`
- preserve current render behavior and reminder content
- attach `updatedItems` details for write-tool rendering

- [ ] **Step 5: Re-run shared tool tests**

Run:
```bash
bun test ./extensions/todos/todo-tools.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit the shared tool layer**

```bash
git add extensions/todos/todo-widget.ts extensions/todos/todo-tools.ts extensions/todos/todo-tools.test.ts
git commit -m "refactor: add shared todos tool registration"
```

### Task 3: Migrate Forge to the shared module and rename its public tools

**Files:**
- Modify: `extensions/forge-content/workflow/index.ts`
- Modify: `extensions/forge-content/index.ts`
- Modify: `extensions/forge-content/prompt/forge-system.md`
- Remove or reduce: `extensions/forge-content/workflow/todo-tools.ts`
- Remove or reduce: `extensions/forge-content/workflow/todo-state.ts`
- Remove or reduce: `extensions/forge-content/workflow/todo-widget.ts`
- Remove or reduce: `extensions/forge-content/workflow/todo-tools.test.ts`
- Remove or reduce: `extensions/forge-content/workflow/todo-state.test.ts`

- [ ] **Step 1: Write or move the failing Forge integration test**

Create or adapt a Forge integration test that verifies:
- Forge registers `todos_write`
- Forge registers `todos_read`
- Forge does not register legacy `todo_write` / `todo_read`

- [ ] **Step 2: Run the Forge integration test to verify it fails**

Run:
```bash
bun test ./extensions/forge-content/workflow
```
Expected: FAIL because Forge still registers the old names.

- [ ] **Step 3: Update Forge workflow registration**

Modify `extensions/forge-content/workflow/index.ts` to call the shared registration function with:
- write name: `todos_write`
- read name: `todos_read`
- write call label: `Update todo`
- read call label: `Read todo`
- Forge-specific prompt snippets/guidelines/descriptions
- Forge-specific widget/status keys

- [ ] **Step 4: Update Forge active-tool configuration**

Modify `extensions/forge-content/index.ts` so the static Forge tool set includes:
- `todos_write`
- `todos_read`

and removes the legacy names.

- [ ] **Step 5: Update Forge prompt references**

Modify `extensions/forge-content/prompt/forge-system.md` to reference `{{tool_names.todos_write}}` (and read tool if present) instead of the old `todo_write` / `todo_read` names.

- [ ] **Step 6: Remove or collapse obsolete Forge-local todo files**

Delete the old Forge-owned implementation files, or temporarily replace them with tiny re-exports if needed during the migration. End state should clearly show shared ownership under `extensions/todos/`.

- [ ] **Step 7: Re-run Forge workflow tests**

Run:
```bash
bun test ./extensions/forge-content/workflow
```
Expected: PASS.

- [ ] **Step 8: Commit the Forge migration**

```bash
git add extensions/forge-content/workflow/index.ts extensions/forge-content/index.ts extensions/forge-content/prompt/forge-system.md extensions/todos extensions/forge-content/workflow
git commit -m "refactor: migrate forge to shared todos tools"
```

### Task 4: Replace Codex plan workflow with the shared todos module

**Files:**
- Modify: `extensions/codex-content/workflow/index.ts`
- Modify: `extensions/codex-content/workflow/types.ts`
- Modify: `extensions/codex-content/tools/index.ts`
- Keep: `extensions/codex-content/workflow/request-user-input.ts`
- Remove: `extensions/codex-content/workflow/plan.ts`
- Remove: `extensions/codex-content/workflow/plan.test.ts`

- [ ] **Step 1: Write the failing Codex workflow test**

Add a Codex workflow integration test that verifies:
- Codex registers `update_plan`
- Codex registers `read_plan`
- Codex still registers `request_user_input`
- Codex no longer depends on the old plan-shape implementation

- [ ] **Step 2: Run the Codex workflow test to verify it fails**

Run:
```bash
bun test ./extensions/codex-content/workflow
```
Expected: FAIL because Codex still uses the old plan module.

- [ ] **Step 3: Replace Codex plan registration with shared todos**

Modify `extensions/codex-content/workflow/index.ts` to register shared todos as:
- write name: `update_plan`
- read name: `read_plan`
- write call label: `Update todo` (or `Update plan` if you deliberately want Codex to keep a plan-oriented UI label while using todo data shape)
- read call label: `Read todo` / `Read plan` consistently with the approved naming choice

Keep `registerRequestUserInputTool(pi)` unchanged.

- [ ] **Step 4: Remove obsolete Codex plan-specific code**

Delete `extensions/codex-content/workflow/plan.ts` and `plan.test.ts`.

Modify `extensions/codex-content/workflow/types.ts` to remove old plan-specific schemas/constants/types that are no longer needed, while preserving any exports still used by request-user-input or workflow wiring.

- [ ] **Step 5: Update Codex compatibility tool-name logic**

Modify `extensions/codex-content/tools/index.ts` so compatibility/active-tool handling references:
- `update_plan`
- `read_plan`

and no longer depends on Forge's old todo tool names where that assumption is obsolete.

- [ ] **Step 6: Re-run Codex workflow tests**

Run:
```bash
bun test ./extensions/codex-content/workflow
```
Expected: PASS.

- [ ] **Step 7: Commit the Codex migration**

```bash
git add extensions/codex-content/workflow/index.ts extensions/codex-content/workflow/types.ts extensions/codex-content/tools/index.ts extensions/codex-content/workflow/request-user-input.ts
git rm extensions/codex-content/workflow/plan.ts extensions/codex-content/workflow/plan.test.ts
git commit -m "refactor: replace codex plan workflow with shared todos"
```

### Task 5: Clean up references and validate the migration end-to-end

**Files:**
- Modify any remaining references found by search
- Verify: `extensions/forge-content/index.ts`
- Verify: `extensions/codex-content/tools/index.ts`
- Verify: prompts/tests under both extensions

- [ ] **Step 1: Search for stale tool names and old plan-shape references**

Run:
```bash
rg "todo_write|todo_read|plan.ts|PlanItemSchema|CODEX_WORKFLOW_TOOL_NAMES|\bplan\b|\bitems\b" extensions/forge-content extensions/codex-content extensions/todos
```
Expected: only intentional references remain.

- [ ] **Step 2: Fix leftover prompt/test/export drift**

Update any remaining stale references discovered by the search, especially:
- old prompt tool-name placeholders
- tests using removed Codex plan shape
- exported constants listing outdated workflow tool names

- [ ] **Step 3: Run focused tests for all touched areas**

Run:
```bash
bun test ./extensions/todos ./extensions/forge-content/workflow ./extensions/codex-content/workflow
```
Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:
```bash
bun run typecheck
```
Expected: PASS.

- [ ] **Step 5: Run the broader relevant test command**

Run:
```bash
bun test ./extensions/forge-content ./extensions/codex-content ./extensions/todos
```
Expected: PASS.

- [ ] **Step 6: Commit cleanup and verification changes**

```bash
git add extensions/todos extensions/forge-content extensions/codex-content package.json
git commit -m "chore: finalize shared todos migration"
```

---

## Notes for the implementer

- Follow @test-driven-development. Every new shared test should fail before code is added.
- Keep behavior DRY and shared; avoid copying the same registration logic back into Forge and Codex.
- Preserve current Forge todo semantics exactly unless the spec explicitly changes them.
- Do not preserve the old Codex `plan` / `items` / `step` / `description` input shape. This migration intentionally standardizes on Forge's `todos` shape.
- Be careful with session reconstruction: it must read tool results matching the configured write-tool alias for the current extension.
- Widget keys must stay extension-scoped so Forge and Codex do not stomp each other's UI state.
- Before claiming completion, follow @verification-before-completion.
