# Subagent API Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the subagent public API around caller-supplied `name`, rename `send_input` to `send_message`, align `Task` tools to the same identifier model, and reduce built-in roles to `default` and `researcher`.

**Architecture:** Keep the shared subagent lifecycle core in `extensions/subagents/subagents/lifecycle-service.ts`, but change the public adapter layers and identity plumbing so both Codex-style and Task-style tools expose `name` instead of UUID-based ids. Preserve the current runtime semantics for spawn, wait, stop, and follow-up delivery; this is a surface-contract cleanup rather than a MultiAgentV2 runtime rewrite.

**Tech Stack:** TypeScript, TypeBox, Node test runner, Pi extension APIs, shared subagent lifecycle/persistence modules.

---

## File Map

### Core files to modify
- `extensions/subagents/subagents/tool-adapters-codex.ts`
  - Replace the public Codex-facing subagent schema.
  - Rename `send_input` to `send_message`.
  - Remove `items`, `task`, `context`, and `workdir` from spawn.
  - Switch public inputs/outputs to `name`.
- `extensions/subagents/subagents/tool-adapters-task.ts`
  - Keep Task semantics but replace `task_id` fields with `name`.
  - Make resume, output, and stop all target `name`.
- `extensions/subagents/subagents/lifecycle-service.ts`
  - Accept caller-supplied names in spawn requests.
  - Stop generating public UUID handles.
  - Resolve runtime records by public `name`.
- `extensions/subagents/subagents/types.ts`
  - Update durable/live record shape if needed to store a required public `name`.
  - Update snapshot/result identity fields if needed.
- `extensions/subagents/subagents/naming.ts`
  - Replace “generated nickname” behavior with validation helpers for caller-supplied names.
  - Add Codex-style name validation (lowercase letters, digits, underscores).
- `extensions/subagents/subagents/profiles-builtins.ts`
  - Reduce built-ins to `default` and `researcher`.
  - Update descriptions.
- `extensions/subagents/assets/agents/explorer.toml`
  - Rename or replace with `researcher.toml`.
- `extensions/subagents/assets/agents/worker.toml`
  - Remove from built-in usage.
- `extensions/subagents/assets/agents/reviewer.toml`
  - Remove from built-in usage.
- `extensions/subagents/subagents/rendering.ts`
  - Ensure display helpers prefer the new `name` identity.
- `extensions/subagents/subagents/registry.ts`
  - Update serialized/session-facing snapshot identity if needed.
- `extensions/subagents/subagents/request-utils.ts`
  - Remove old prompt-composition helpers that only exist for `task/context/items` if no longer needed.
- `extensions/subagents/subagents/results.ts`
  - Change result JSON helpers from `agent_id`/`task_id` to `name`.

### Supporting files likely to update
- `extensions/subagents/index.test.ts`
- `extensions/subagents/subagents/profiles.test.ts`
- `extensions/droid-content/index.test.ts`
- `extensions/codex-content/index.test.ts`
- `extensions/skill/index.test.ts`
- Any tests under `extensions/shared/` or `extensions/subagents/` that assert tool names or result shapes.

### Specs/docs to reference while implementing
- `docs/superpowers/specs/2026-04-10-subagent-api-simplification-design.md`
- `/Volumes/Data/Projects/codex/codex-rs/tools/src/agent_tool.rs`
- `/Volumes/Data/Projects/codex/codex-rs/protocol/src/agent_path.rs`

---

### Task 1: Lock the public API contract in tests

**Files:**
- Modify: `extensions/subagents/index.test.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Add/replace Codex tool registration assertions**

Add test coverage that expects the Codex-facing tool family to be:
- `spawn_agent`
- `send_message`
- `wait_agent`
- `close_agent`

and explicitly no longer expects `send_input`.

- [ ] **Step 2: Add failing spawn schema expectations**

In `extensions/subagents/index.test.ts`, add assertions for the registered `spawn_agent` schema covering:
- required `name`
- required `message`
- allowed optional fields: `agent_type`, `fork_context`, `model`, `reasoning_effort`, `interactive`, `run_in_background`
- no `task`, `context`, `items`, `workdir`

- [ ] **Step 3: Add failing send_message schema expectations**

Add assertions that `send_message`:
- is registered under that exact name
- accepts `target`, `message`, `interrupt`
- does not expose `items`, `id`, or `agent_id`

- [ ] **Step 4: Add failing Task identity expectations**

Add assertions that Task-family tools now use `name` instead of `task_id` in:
- Task result shape
- `TaskOutput` parameter shape
- `TaskStop` parameter shape

- [ ] **Step 5: Run focused test file to verify failures**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: failures mentioning old tool names, old params, or old result shapes.

- [ ] **Step 6: Commit red tests**

```bash
git add extensions/subagents/index.test.ts
git commit -m "test: lock simplified subagent API contract"
```

---

### Task 2: Replace generated public ids with validated caller-supplied names

**Files:**
- Modify: `extensions/subagents/subagents/naming.ts`
- Modify: `extensions/subagents/subagents/types.ts`
- Modify: `extensions/subagents/subagents/lifecycle-service.ts`
- Modify: `extensions/subagents/subagents/registry.ts`
- Modify: `extensions/subagents/subagents/rendering.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Read current naming helpers completely**

Inspect:
- `extensions/subagents/subagents/naming.ts`
- any lifecycle call sites using `resolveName` / generated nickname logic

Document in code comments or task notes which responsibilities remain and which are removed.

- [ ] **Step 2: Write failing unit coverage for name validation**

Add tests for a helper that enforces:
- valid: `research_auth`, `task2`, `a_1`
- invalid: `BadName`, `has-dash`, `has space`, empty string

- [ ] **Step 3: Implement name validation helper**

Add a focused helper such as:
```ts
export function validateSubagentName(name: string): string
```

Behavior:
- trims input
- rejects empty
- rejects anything outside lowercase letters, digits, underscores
- returns normalized trimmed string

- [ ] **Step 4: Replace lifecycle spawn public id generation with required name**

In `lifecycle-service.ts`:
- add a required `name` field to spawn requests
- stop calling `randomUUID()` for the public handle
- use validated `name` as the durable/live key
- preserve any internal implementation details only if necessary, but do not expose them publicly

- [ ] **Step 5: Enforce duplicate live-name rejection**

Before attaching a new child, check for an existing live child with the same public `name`.
Return a concise error if found.

- [ ] **Step 6: Update durable record/snapshot types**

Ensure the record shape treats `name` as the stable identity and no longer relies on optional display-name semantics.
Keep display rendering consistent with the new required name.

- [ ] **Step 7: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: newly added contract tests move closer to green; any remaining failures should point to adapter/result layers.

- [ ] **Step 8: Commit identity-model changes**

```bash
git add extensions/subagents/subagents/naming.ts extensions/subagents/subagents/types.ts extensions/subagents/subagents/lifecycle-service.ts extensions/subagents/subagents/registry.ts extensions/subagents/subagents/rendering.ts extensions/subagents/index.test.ts
git commit -m "refactor: use caller-supplied subagent names"
```

---

### Task 3: Simplify `spawn_agent` to the new schema and result shape

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/request-utils.ts`
- Modify: `extensions/subagents/subagents/results.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Remove old spawn prompt composition inputs from tests**

Delete or rewrite tests that depend on:
- `task`
- `context`
- `items`

Keep only meaningful tests for required plain-text `message`.

- [ ] **Step 2: Replace `spawn_agent` parameter schema**

In `tool-adapters-codex.ts`, define parameters as:
```ts
Type.Object({
  name: Type.String(...),
  message: Type.String(...),
  agent_type: Type.Optional(Type.String(...)),
  fork_context: Type.Optional(Type.Boolean(...)),
  model: Type.Optional(Type.String(...)),
  reasoning_effort: Type.Optional(Type.String(...)),
  interactive: Type.Optional(Type.Boolean(...)),
  run_in_background: Type.Optional(Type.Boolean(...)),
})
```

- [ ] **Step 3: Update spawn execution path**

Pass only the new fields into lifecycle spawn.
Always use `ctx.cwd` as the child cwd.
Remove all `items` / `context` prompt-construction logic from this adapter path.

- [ ] **Step 4: Replace public spawn result content**

Update result JSON to return:
```json
{ "name": "..." }
```

Do not return `agent_id`.
Only preserve extra details if they are needed for rendering, not as public contract.

- [ ] **Step 5: Update tool call/result rendering**

Ensure renderers and previews still show useful information, but with the simplified schema.
Use the required `name` as the displayed identity.

- [ ] **Step 6: Run focused test file**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: `spawn_agent` schema/result tests pass.

- [ ] **Step 7: Commit spawn simplification**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/request-utils.ts extensions/subagents/subagents/results.ts extensions/subagents/index.test.ts
git commit -m "refactor: simplify spawn_agent around name and message"
```

---

### Task 4: Rename `send_input` to `send_message` and remove `items`

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/types.ts`
- Test: `extensions/subagents/index.test.ts`
- Test: `extensions/codex-content/index.test.ts`
- Test: `extensions/shared/toolset-resolver.test.ts`

- [ ] **Step 1: Update the registered tool name**

Change the Codex adapter registration from `send_input` to `send_message`.

- [ ] **Step 2: Replace schema with text-only message contract**

Use:
```ts
Type.Object({
  target: Type.String(...),
  message: Type.String(...),
  interrupt: Type.Optional(Type.Boolean(...)),
})
```

Do not expose `items`, `id`, or `agent_id`.

- [ ] **Step 3: Map `target` to the shared lifecycle handle**

Resolve `target` directly as the public subagent `name` and send the plain-text message through the existing lifecycle resume/follow-up path.

- [ ] **Step 4: Update result contract**

Preserve the existing submission acknowledgement shape if still useful:
```json
{ "submission_id": "..." }
```

but ensure details/rendering refer to the target `name`.

- [ ] **Step 5: Update toolset registry and resolver tests**

Update shared toolset expectations so Codex mode exposes:
- `spawn_agent`
- `send_message`
- `wait_agent`
- `close_agent`

- [ ] **Step 6: Run relevant tests**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/codex-content/index.test.ts extensions/shared/toolset-resolver.test.ts
```

Expected: old `send_input` expectations are gone and new `send_message` expectations pass.

- [ ] **Step 7: Commit messaging rename**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/types.ts extensions/subagents/index.test.ts extensions/codex-content/index.test.ts extensions/shared/toolset-resolver.test.ts
git commit -m "refactor: rename send_input to send_message"
```

---

### Task 5: Align `wait_agent` and `close_agent` with name-based targeting

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/lifecycle-service.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Update `wait_agent` parameter schema**

Replace id-based parameter naming with name-based targeting.
Recommended shape:
```ts
Type.Object({
  names: Type.Array(Type.String(), ...),
  timeout_ms: Type.Optional(Type.Number(...)),
})
```

Keep the current wait semantics intact.

- [ ] **Step 2: Update `close_agent` parameter schema**

Use:
```ts
Type.Object({
  target: Type.String(...),
})
```

Resolve the target as the public `name`.

- [ ] **Step 3: Update lifecycle lookup helpers**

Ensure wait/stop use the public name-based store lookup consistently.

- [ ] **Step 4: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: name-based wait/close contract tests pass without changing underlying wait semantics.

- [ ] **Step 5: Commit name-based wait/close updates**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/lifecycle-service.ts extensions/subagents/index.test.ts
git commit -m "refactor: target wait and close by subagent name"
```

---

### Task 6: Align Task, TaskOutput, and TaskStop to `name`

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-task.ts`
- Test: `extensions/subagents/index.test.ts`
- Test: `extensions/droid-content/index.test.ts`
- Test: `extensions/skill/index.test.ts`

- [ ] **Step 1: Update Task output shape in tests**

Replace `task_id` assertions with `name` in:
- background result
- foreground result
- resume details

- [ ] **Step 2: Update Task input schema**

Keep `prompt`, `subagent_type`, `description`, `complexity`, `run_in_background`, `model`.
Replace `resume` semantics so it refers to an existing `name`.
Remove `workdir` from the public schema.

- [ ] **Step 3: Update TaskOutput schema**

Replace:
```ts
{ task_id, block?, timeout? }
```
with:
```ts
{ name, block?, timeout? }
```

- [ ] **Step 4: Update TaskStop schema**

Replace:
```ts
{ task_id }
```
with:
```ts
{ name }
```

- [ ] **Step 5: Update renderers and result details**

Ensure internal details/rendering use the public `name` consistently while preserving current behavior.

- [ ] **Step 6: Run relevant tests**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts
```

Expected: Task-family tests pass with `name`-based identity.

- [ ] **Step 7: Commit Task-family alignment**

```bash
git add extensions/subagents/subagents/tool-adapters-task.ts extensions/subagents/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts
git commit -m "refactor: align task tools to name-based subagent identity"
```

---

### Task 7: Reduce built-in profiles to `default` and `researcher`

**Files:**
- Modify: `extensions/subagents/subagents/profiles-builtins.ts`
- Create: `extensions/subagents/assets/agents/researcher.toml`
- Modify or Create: `extensions/subagents/assets/agents/default.toml`
- Test: `extensions/subagents/subagents/profiles.test.ts`

- [ ] **Step 1: Write failing profile tests**

Add/replace tests asserting:
- built-ins are exactly `default` and `researcher`
- both are visible
- both have non-empty `developerInstructions`

- [ ] **Step 2: Update built-in declarations**

In `profiles-builtins.ts`:
- remove `explorer`
- remove `worker`
- remove `reviewer`
- add `researcher`
- ensure `default` points to an asset file with explicit instructions

- [ ] **Step 3: Add `researcher.toml`**

Base this on the current `explorer.toml`, but rename the role and tune wording toward deep repository/code research.

- [ ] **Step 4: Add explicit instructions for `default`**

Create a focused `default.toml` with concise production-oriented instructions so every built-in has explicit developer guidance.

- [ ] **Step 5: Keep old asset files only if needed temporarily**

If old files remain on disk for compatibility during implementation, ensure they are no longer referenced by the built-in registry.

- [ ] **Step 6: Run profile tests**

Run:
```bash
bun test extensions/subagents/subagents/profiles.test.ts
```

Expected: built-in profile expectations pass with only `default` and `researcher`.

- [ ] **Step 7: Commit built-in profile cleanup**

```bash
git add extensions/subagents/subagents/profiles-builtins.ts extensions/subagents/assets/agents/researcher.toml extensions/subagents/assets/agents/default.toml extensions/subagents/subagents/profiles.test.ts
git commit -m "refactor: reduce built-in subagent profiles"
```

---

### Task 8: Replace `spawn_agent` tool guidance with Codex-style delegation guidance

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Optionally Create: `extensions/subagents/subagents/tool-description.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Extract description-building helper if needed**

If the current `spawn_agent` description becomes too long or complex inline, move it into a small dedicated helper module to keep `tool-adapters-codex.ts` focused.

- [ ] **Step 2: Port the Codex guidance text**

Adapt the guidance from:
- `/Volumes/Data/Projects/codex/codex-rs/tools/src/agent_tool.rs`

Keep the important rules, but update terminology to match this repo’s public API:
- use `name` rather than `task_name`
- use `send_message` rather than `send_input`
- do not mention mailbox semantics or features we are not implementing

- [ ] **Step 3: Add high-value description assertions**

Assert only meaningful contract text, for example:
- explicit delegation authorization requirement
- “requests for depth/research do not authorize spawning”
- wait sparingly guidance

Avoid brittle full-string snapshots.

- [ ] **Step 4: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: description assertions pass without overfitting exact formatting.

- [ ] **Step 5: Commit tool-guidance update**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/index.test.ts extensions/subagents/subagents/tool-description.ts
git commit -m "docs: adopt codex-style subagent delegation guidance"
```

---

### Task 9: Remove stale helpers and tighten affected tests

**Files:**
- Modify: `extensions/subagents/subagents/request-utils.ts`
- Modify: `extensions/subagents/internal-test-helpers.ts`
- Modify: `extensions/subagents/index.test.ts`
- Modify: any affected test files identified during implementation

- [ ] **Step 1: Delete dead prompt-composition paths**

Remove helpers that only exist for:
- `task`
- `context`
- `items`

if they no longer have any caller.

- [ ] **Step 2: Trim low-value tests made obsolete by the new contract**

Per repo test guidance, remove tests that only restate old static strings or removed schema details that no longer protect runtime behavior.

- [ ] **Step 3: Run the subagent-related test set**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/subagents/subagents/profiles.test.ts extensions/codex-content/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts extensions/shared/toolset-resolver.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 4: Commit cleanup**

```bash
git add extensions/subagents/subagents/request-utils.ts extensions/subagents/internal-test-helpers.ts extensions/subagents/index.test.ts extensions/subagents/subagents/profiles.test.ts extensions/codex-content/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts extensions/shared/toolset-resolver.test.ts
git commit -m "refactor: remove stale subagent API helpers"
```

---

### Task 10: Full verification and final integration check

**Files:**
- Modify only if verification reveals real issues

- [ ] **Step 1: Run repository typecheck/build/tests relevant to changed surface**

Run the project-standard verification commands. If not obvious, inspect `package.json` / workspace scripts first, then run the relevant combination such as:
```bash
bun test
bun run typecheck
bun run build
```

Use the exact scripts available in the repo.

- [ ] **Step 2: Manually inspect the final registered tool surface**

Verify in code that:
- Codex mode exposes `send_message`, not `send_input`
- public spawn uses `name` + `message`
- Task-family tools use `name`
- built-ins are only `default` + `researcher`

- [ ] **Step 3: If any failure appears, fix only the root cause**

Do not bundle cleanup or unrelated refactors here.

- [ ] **Step 4: Commit final verification fixes if needed**

```bash
git add <relevant files>
git commit -m "fix: resolve final subagent API integration issues"
```

- [ ] **Step 5: Summarize the final contract change for review**

Prepare a concise summary listing:
- removed fields/tools
- renamed fields/tools
- new built-in roles
- any deliberate non-goals kept unchanged

---

## Notes for Implementers

- Prefer minimal changes to lifecycle behavior. This project is changing the public contract first, not building full MultiAgentV2.
- If the current runtime absolutely requires an internal opaque key, keep it internal and never expose it publicly.
- If name collisions become tricky because of durable closed records, only enforce uniqueness among live/active children unless the spec explicitly requires stricter behavior.
- When porting Codex guidance text, keep the important behavioral rules but avoid introducing references to unsupported features.
- Keep tests lean: focus on runtime contract and meaningful regressions, not exhaustive static-schema snapshots.
