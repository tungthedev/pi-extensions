# Subagent API Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the subagent public API around caller-supplied `name`, rename `send_input` to `send_message`, align `Task` tools to the same identifier model, and reduce built-in roles to `default` and `researcher`.

**Architecture:** Keep the shared subagent lifecycle core and its internal opaque ids. Add a public `name` layer on top of the current runtime so public APIs accept and return `name` while persistence, attachments, and session wiring may continue using internal ids. Preserve the current runtime semantics for spawn, wait, stop, and follow-up delivery; this is a public-contract cleanup rather than a MultiAgentV2 runtime rewrite.

**Tech Stack:** TypeScript, TypeBox, Node test runner, Pi extension APIs, shared subagent lifecycle/persistence modules.

---

## File Map

### Core files to modify
- `extensions/subagents/subagents/tool-adapters-codex.ts`
  - Replace the public Codex-facing spawn/message/wait/close schemas.
  - Rename `send_input` to `send_message`.
  - Remove `items`, `task`, `context`, and `workdir` from the public spawn surface.
  - Reshape public results so they expose `name`, not internal ids.
- `extensions/subagents/subagents/tool-adapters-task.ts`
  - Require `name` on Task spawn.
  - Replace `task_id` fields with `name`.
  - Make resume/output/stop all target `name`.
- `extensions/subagents/subagents/lifecycle-service.ts`
  - Accept caller-supplied public names on spawn.
  - Keep internal opaque ids.
  - Add name-to-runtime resolution support instead of replacing all internal keys.
- `extensions/subagents/subagents/runtime-store.ts`
  - Add or expose public-name lookup/index support.
  - Define how publicly addressable children are resolved by `name`.
- `extensions/subagents/subagents/types.ts`
  - Update public-facing snapshot/result types and tool-name constants.
  - Keep internal/runtime types clear about what remains opaque.
- `extensions/subagents/subagents/naming.ts`
  - Replace generated-name logic with validation helpers for caller-supplied names.
  - Add Codex-style validation: lowercase letters, digits, underscores.
- `extensions/subagents/subagents/results.ts`
  - Change result JSON helpers from `agent_id`/`task_id` to `name`.
- `extensions/subagents/subagents/notifications.ts`
  - Remove public `agent_id` leakage in model-visible payloads if present.
- `extensions/subagents/subagents/rendering.ts`
  - Ensure display helpers prefer the new public `name` identity.
- `extensions/subagents/subagents/registry.ts`
  - Update serialized/session-facing shaping if public fields are exposed from here.
- `extensions/subagents/subagents/persistence.ts`
  - Confirm name/addressability rules against current durable registry reconstruction.
- `extensions/subagents/subagents/profiles-builtins.ts`
  - Reduce built-ins to `default` and `researcher`.
  - Update descriptions and assets.
- `extensions/subagents/subagents/index.ts`
  - Update any public lookup/error paths that still assume `agentId` is the user-facing handle.
- `extensions/shared/toolset-registry.ts`
  - Replace Codex tool family membership from `send_input` to `send_message`.

### Asset files to modify/create
- Create: `extensions/subagents/assets/agents/default.toml`
- Create: `extensions/subagents/assets/agents/researcher.toml`
- Stop referencing:
  - `extensions/subagents/assets/agents/explorer.toml`
  - `extensions/subagents/assets/agents/worker.toml`
  - `extensions/subagents/assets/agents/reviewer.toml`

### Tests likely to update
- `extensions/subagents/index.test.ts`
- `extensions/subagents/subagents/profiles.test.ts`
- `extensions/shared/toolset-resolver.test.ts`
- `extensions/codex-content/index.test.ts`
- `extensions/droid-content/index.test.ts`
- `extensions/skill/index.test.ts`

### Specs/docs to reference while implementing
- `docs/superpowers/specs/2026-04-10-subagent-api-simplification-design.md`
- `/Volumes/Data/Projects/codex/codex-rs/tools/src/agent_tool.rs`
- `/Volumes/Data/Projects/codex/codex-rs/protocol/src/agent_path.rs`

---

### Task 1: Add high-value contract tests for the public API changes

**Files:**
- Modify: `extensions/subagents/index.test.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Add Codex tool-family assertions**

Add or update tests so Codex mode expects:
- `spawn_agent`
- `send_message`
- `wait_agent`
- `close_agent`

and no longer expects `send_input`.

- [ ] **Step 2: Add runtime-focused spawn contract tests**

Add tests that protect the meaningful public contract:
- `spawn_agent` requires `name`
- `spawn_agent` requires `message`
- invalid `name` format rejects
- returned public payload uses `name`
- foreground spawn public results must not expose `agent_id`

Avoid exhaustive static schema snapshots for every optional field.

- [ ] **Step 3: Add runtime-focused Task contract tests**

Add tests that protect:
- `Task` requires `name` when spawning
- `Task` returns `name`
- `TaskOutput` uses `name`
- `TaskStop` uses `name`
- Task-family public results do not expose `task_id`

- [ ] **Step 4: Add wait/close public-shape tests**

Add tests that protect:
- `wait_agent` targets by public `name`
- `wait_agent` public results do not expose `agent_id`
- `close_agent` targets by public `name`
- `close_agent` public results do not expose `agent_id`

- [ ] **Step 5: Run focused tests to verify failures**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: failures show the old contract still leaks ids or old tool names.

- [ ] **Step 6: Commit the red tests**

```bash
git add extensions/subagents/index.test.ts
git commit -m "test: lock public subagent name contract"
```

---

### Task 2: Introduce public-name validation and resolution without rewriting runtime keys

**Files:**
- Modify: `extensions/subagents/subagents/naming.ts`
- Modify: `extensions/subagents/subagents/runtime-store.ts`
- Modify: `extensions/subagents/subagents/lifecycle-service.ts`
- Modify: `extensions/subagents/subagents/types.ts`
- Modify: `extensions/subagents/subagents/index.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Read current runtime identity flow completely**

Inspect:
- `extensions/subagents/subagents/lifecycle-service.ts`
- `extensions/subagents/subagents/runtime-store.ts`
- `extensions/subagents/subagents/index.ts`
- `extensions/subagents/subagents/persistence.ts`

Confirm where internal ids are required and where public lookups can be layered on top.

- [ ] **Step 2: Add failing tests for name validation and addressability rules**

Add tests for a focused helper such as:
```ts
validateSubagentName(name: string): string
```

Protect:
- valid: `research_auth`, `task2`, `a_1`
- invalid: `BadName`, `has-dash`, `has space`, empty string

Also add tests for duplicate publicly addressable names.

- [ ] **Step 3: Implement name validation helper**

Implement a helper that:
- trims input
- rejects empty
- rejects anything outside lowercase letters, digits, underscores
- returns normalized trimmed string

- [ ] **Step 4: Add public-name lookup support to the runtime store**

Add a focused mapping/index layer so the runtime can:
- find a publicly addressable child by `name`
- reject duplicate addressable names on spawn
- distinguish between addressable and no-longer-addressable records

Do **not** replace the underlying runtime key from internal `agentId` to `name`.

- [ ] **Step 5: Update lifecycle spawn to accept a public `name`**

In `lifecycle-service.ts`:
- add a required `name` field to spawn requests
- validate it before spawning
- keep generating/using internal opaque ids as needed
- store the public name on the durable record so adapters can expose it consistently

- [ ] **Step 6: Define and implement the public addressability rule**

Match the spec:
- names must be unique among children that remain publicly addressable
- live and detached/resumable children count as addressable
- reuse is allowed only after the older child is no longer publicly addressable

Implement the smallest store/lifecycle support needed to enforce this.

- [ ] **Step 7: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: name validation and duplicate-name tests move green without requiring a full runtime-key migration.

- [ ] **Step 8: Commit name resolution changes**

```bash
git add extensions/subagents/subagents/naming.ts extensions/subagents/subagents/runtime-store.ts extensions/subagents/subagents/lifecycle-service.ts extensions/subagents/subagents/types.ts extensions/subagents/subagents/index.ts extensions/subagents/index.test.ts
git commit -m "refactor: add public subagent name resolution"
```

---

### Task 3: Simplify `spawn_agent` to the new schema and public result contract

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/request-utils.ts`
- Modify: `extensions/subagents/subagents/results.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Remove dead public spawn inputs from the adapter**

Delete or bypass adapter logic that exists only for:
- `task`
- `context`
- `items`
- `workdir`

Keep the child cwd inherited from the parent session.

- [ ] **Step 2: Replace `spawn_agent` parameters with the new contract**

Use a schema shaped like:
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

- [ ] **Step 3: Pass only the new spawn inputs into lifecycle spawn**

Use:
- `name`
- `message`
- optional role/model/fork/interactive/background fields

Do not expose workdir override.

- [ ] **Step 4: Reshape public spawn results**

Return public payloads centered on:
```json
{ "name": "..." }
```

If foreground spawn still needs status/output details, reshape them so they do not expose `agent_id`.

- [ ] **Step 5: Update rendering to use the public name**

Ensure call/result previews and labels use the required public `name`.

- [ ] **Step 6: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: `spawn_agent` contract tests pass and public id leakage is reduced.

- [ ] **Step 7: Commit spawn simplification**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/request-utils.ts extensions/subagents/subagents/results.ts extensions/subagents/index.test.ts
git commit -m "refactor: simplify spawn_agent around public names"
```

---

### Task 4: Rename `send_input` to `send_message` and keep text-only follow-up

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/types.ts`
- Modify: `extensions/shared/toolset-registry.ts`
- Test: `extensions/subagents/index.test.ts`
- Test: `extensions/codex-content/index.test.ts`
- Test: `extensions/shared/toolset-resolver.test.ts`

- [ ] **Step 1: Rename the registered tool**

Change the Codex adapter registration from `send_input` to `send_message`.

- [ ] **Step 2: Replace schema with the public text-only contract**

Use:
```ts
Type.Object({
  target: Type.String(...),
  message: Type.String(...),
  interrupt: Type.Optional(Type.Boolean(...)),
})
```

Do not expose `items`, `id`, or `agent_id`.

- [ ] **Step 3: Resolve `target` by public name**

Translate the public `target` name to the internal runtime child and use the existing lifecycle resume/follow-up path.

- [ ] **Step 4: Update result details and rendering**

Keep submission acknowledgement if useful, but ensure any public-facing details refer to the target `name` and do not expose `agent_id`.

- [ ] **Step 5: Update toolset registry/resolver expectations**

Make sure Codex mode exposes:
- `spawn_agent`
- `send_message`
- `wait_agent`
- `close_agent`

- [ ] **Step 6: Run relevant tests**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/codex-content/index.test.ts extensions/shared/toolset-resolver.test.ts
```

Expected: `send_input` expectations are gone and `send_message` expectations pass.

- [ ] **Step 7: Commit messaging rename**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/types.ts extensions/shared/toolset-registry.ts extensions/subagents/index.test.ts extensions/codex-content/index.test.ts extensions/shared/toolset-resolver.test.ts
git commit -m "refactor: rename send_input to send_message"
```

---

### Task 5: Keep current wait/close semantics but target and shape them by public `name`

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Modify: `extensions/subagents/subagents/lifecycle-service.ts`
- Modify: `extensions/subagents/subagents/results.ts`
- Modify: `extensions/subagents/subagents/notifications.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Change `wait_agent` inputs to public names**

Update the schema to accept public names instead of ids.
A shape like this is acceptable if it matches existing usage patterns:
```ts
Type.Object({
  names: Type.Array(Type.String(), ...),
  timeout_ms: Type.Optional(Type.Number(...)),
})
```

Keep the current wait semantics intact.

- [ ] **Step 2: Change `close_agent` inputs to public names**

Use:
```ts
Type.Object({
  target: Type.String(...),
})
```

Resolve the target by public `name`.

- [ ] **Step 3: Reshape public wait/close results**

Any public payload returned from wait/close must avoid `agent_id`.
If the underlying lifecycle still produces internal snapshots, reshape them at the adapter/result layer.

- [ ] **Step 4: Update model-visible notifications if needed**

If notifications or helper payloads still expose `agent_id` to the model, reshape them to `name` or suppress the internal id.

- [ ] **Step 5: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: wait/close name-based contract tests pass without a mailbox rewrite.

- [ ] **Step 6: Commit wait/close public contract changes**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/subagents/lifecycle-service.ts extensions/subagents/subagents/results.ts extensions/subagents/subagents/notifications.ts extensions/subagents/index.test.ts
git commit -m "refactor: expose wait and close by public subagent name"
```

---

### Task 6: Require `name` in Task spawn and remove public `task_id`

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-task.ts`
- Test: `extensions/subagents/index.test.ts`
- Test: `extensions/droid-content/index.test.ts`
- Test: `extensions/skill/index.test.ts`

- [ ] **Step 1: Update Task spawn contract in tests**

Protect:
- `Task` requires `name` when spawning a new child
- `Task` keeps `prompt`
- `Task` returns `name`
- Task resume uses `name`

- [ ] **Step 2: Update Task schema**

Keep:
- `prompt`
- `subagent_type`
- `description`
- `complexity`
- `run_in_background`
- `model`

Add:
- `name` for new spawns

Remove:
- public `workdir`
- public `task_id`

- [ ] **Step 3: Update TaskOutput and TaskStop schemas**

Replace:
```ts
{ task_id, ... }
```
with:
```ts
{ name, ... }
```

- [ ] **Step 4: Reshape public Task-family results**

Ensure Task, TaskOutput, and TaskStop return public `name` and do not expose `task_id`.
If internal details still contain opaque ids, keep them internal.

- [ ] **Step 5: Update Task-family rendering**

Use the public `name` in renderers and labels.

- [ ] **Step 6: Run relevant tests**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts
```

Expected: Task-family tests pass with public `name` and no `task_id` leakage.

- [ ] **Step 7: Commit Task-family alignment**

```bash
git add extensions/subagents/subagents/tool-adapters-task.ts extensions/subagents/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts
git commit -m "refactor: align task tools to public subagent names"
```

---

### Task 7: Reduce built-in roles to `default` and `researcher`

**Files:**
- Modify: `extensions/subagents/subagents/profiles-builtins.ts`
- Create: `extensions/subagents/assets/agents/default.toml`
- Create: `extensions/subagents/assets/agents/researcher.toml`
- Test: `extensions/subagents/subagents/profiles.test.ts`

- [ ] **Step 1: Add high-value profile tests**

Protect:
- built-ins are exactly `default` and `researcher`
- both are visible
- both have non-empty `developerInstructions`
- custom-role merge/shadow behavior still works after the built-in cleanup

- [ ] **Step 2: Update the built-in declarations**

In `profiles-builtins.ts`:
- remove `explorer`
- remove `worker`
- remove `reviewer`
- add `researcher`
- ensure `default` points to an asset file with explicit instructions

- [ ] **Step 3: Add `researcher.toml`**

Base it on the current `explorer.toml`, but tune wording toward deep repository/code research.

- [ ] **Step 4: Add `default.toml`**

Create explicit default built-in instructions so every remaining built-in has developer guidance.

- [ ] **Step 5: Run profile tests**

Run:
```bash
bun test extensions/subagents/subagents/profiles.test.ts
```

Expected: built-in profile expectations pass and custom-role behavior still holds.

- [ ] **Step 6: Commit profile cleanup**

```bash
git add extensions/subagents/subagents/profiles-builtins.ts extensions/subagents/assets/agents/default.toml extensions/subagents/assets/agents/researcher.toml extensions/subagents/subagents/profiles.test.ts
git commit -m "refactor: simplify built-in subagent profiles"
```

---

### Task 8: Replace `spawn_agent` guidance with Codex-style delegation rules

**Files:**
- Modify: `extensions/subagents/subagents/tool-adapters-codex.ts`
- Optionally Create: `extensions/subagents/subagents/tool-description.ts`
- Test: `extensions/subagents/index.test.ts`

- [ ] **Step 1: Extract description-building helper if it improves clarity**

If the description becomes too long inline, move it into a focused helper module.

- [ ] **Step 2: Port the meaningful guidance from Codex**

Adapt the guidance from:
- `/Volumes/Data/Projects/codex/codex-rs/tools/src/agent_tool.rs`

Keep the important rules, but update terminology to match this repo:
- use `name`
- use `send_message`
- do not mention mailbox semantics or unsupported features

- [ ] **Step 3: Add a few non-brittle assertions**

Assert only high-signal guidance, for example:
- explicit user authorization requirement for spawning
- depth/research does not itself authorize spawning
- use `wait_agent` sparingly

Avoid full-string snapshots of the whole help text.

- [ ] **Step 4: Run focused tests**

Run:
```bash
bun test extensions/subagents/index.test.ts
```

Expected: guidance assertions pass without pinning formatting.

- [ ] **Step 5: Commit guidance update**

```bash
git add extensions/subagents/subagents/tool-adapters-codex.ts extensions/subagents/index.test.ts extensions/subagents/subagents/tool-description.ts
git commit -m "docs: adopt codex-style subagent guidance"
```

---

### Task 9: Remove stale helpers and trim low-value tests

**Files:**
- Modify: `extensions/subagents/subagents/request-utils.ts`
- Modify: `extensions/subagents/internal-test-helpers.ts`
- Modify: `extensions/subagents/index.test.ts`
- Modify: any affected test files identified during implementation

- [ ] **Step 1: Remove dead helper paths**

Delete helpers that only exist for removed public inputs such as:
- `task`
- `context`
- `items`

if no live caller still needs them.

- [ ] **Step 2: Trim low-value static assertions**

Remove tests that mostly restate static schema/default/help text and no longer protect meaningful runtime behavior.

- [ ] **Step 3: Keep and add only high-signal regressions**

Make sure the remaining suite still protects:
- spawn by public `name`
- send_message by public `name`
- wait/close by public `name`
- duplicate-name rejection
- addressability/reuse behavior
- profile merge/shadow behavior after built-in cleanup

- [ ] **Step 4: Run the targeted subagent-related suite**

Run:
```bash
bun test extensions/subagents/index.test.ts extensions/subagents/subagents/profiles.test.ts extensions/codex-content/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts extensions/shared/toolset-resolver.test.ts
```

Expected: targeted tests pass and the suite stays focused on runtime/public-contract behavior.

- [ ] **Step 5: Commit helper/test cleanup**

```bash
git add extensions/subagents/subagents/request-utils.ts extensions/subagents/internal-test-helpers.ts extensions/subagents/index.test.ts extensions/subagents/subagents/profiles.test.ts extensions/codex-content/index.test.ts extensions/droid-content/index.test.ts extensions/skill/index.test.ts extensions/shared/toolset-resolver.test.ts
git commit -m "refactor: trim stale subagent helpers and tests"
```

---

### Task 10: Full verification and final contract review

**Files:**
- Modify only if verification reveals real issues

- [ ] **Step 1: Inspect the repo scripts before running broad verification**

Read the workspace scripts (for example in `package.json` and any workspace config) and identify the exact verification commands used by this repo.

- [ ] **Step 2: Run the project-standard verification commands**

Run the exact available scripts, for example:
```bash
bun test
bun run typecheck
bun run build
```

Use the real commands from the repo rather than assuming names.

- [ ] **Step 3: Manually inspect the final public contract**

Verify in code and tests that:
- Codex mode exposes `send_message`, not `send_input`
- public spawn uses `name` + `message`
- `Task` requires/returns `name`
- wait/close target and return public `name`
- public results do not expose `agent_id` / `task_id`
- built-ins are only `default` + `researcher`

- [ ] **Step 4: If failures appear, fix only the root cause**

Do not bundle unrelated cleanup here.

- [ ] **Step 5: Commit final verification fixes if needed**

```bash
git add <relevant files>
git commit -m "fix: resolve final subagent API integration issues"
```

- [ ] **Step 6: Summarize the final change for review**

Prepare a concise review summary listing:
- removed fields/tools
- renamed fields/tools
- new/remaining built-in roles
- public `name` behavior and reuse/addressability rule
- deliberate non-goals that remain unchanged

---

## Notes for Implementers

- Prefer minimal changes to lifecycle behavior. This project is changing the public contract first, not building full MultiAgentV2.
- Keep internal opaque ids if the runtime depends on them; adapters and lookup helpers should translate public `name` to internal ids.
- Be explicit about publicly addressable children and name reuse. Do not leave detached/closed lookup behavior ambiguous.
- Remove public `agent_id` / `task_id` leakage at adapter/result/notification boundaries even if internal snapshots still contain opaque ids.
- When porting Codex guidance text, keep the important behavioral rules but avoid references to unsupported features.
- Keep tests lean: prioritize runtime contract, integration boundaries, and real regressions over exhaustive schema snapshots or brittle help-text snapshots.
