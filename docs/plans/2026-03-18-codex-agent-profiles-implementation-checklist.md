# Codex Agent Profiles Implementation Checklist

Date: 2026-03-18

Related design:

- `docs/plans/2026-03-18-codex-agent-profiles-design.md`

## Goal

Execute Codex-like agent profile support in `extensions/codex-content/` with a safe patch order.

This checklist is implementation-oriented:

- exact target files
- patch sequencing
- test checkpoints
- rollback boundaries between phases

---

## Success criteria

- `spawn_agent` defaults omitted `agent_type` to `default`
- built-in profiles `default`, `explorer`, and `worker` are available
- `agent_type` changes real child behavior, not just naming
- custom Codex roles load from Codex config and `agents/` role files
- child prompt injection includes role-specific developer instructions
- durable child state stores the selected role
- `spawn_agent` advertises available roles like Codex
- tests cover built-ins, custom loading, spawn precedence, and rendering

---

## Implementation strategy

Land this in four slices:

1. profile core and built-ins
2. child prompt bootstrap and spawn integration
3. Codex config loading for custom roles
4. UX, rendering, and test hardening

The main rule is:

- do not start by editing `extensions/codex-content/subagents/index.ts` heavily
- first extract the profile logic into small modules
- then wire it into spawn incrementally

---

## Patch order

## Phase 1 — Profile core and built-ins

### Goal

Create a self-contained role/profile subsystem without changing spawn behavior yet.

### Files to add

- `extensions/codex-content/subagents/profiles-types.ts`
- `extensions/codex-content/subagents/profiles-builtins.ts`
- `extensions/codex-content/subagents/profiles.ts`
- `extensions/codex-content/subagents/profiles.test.ts`
- `extensions/codex-content/assets/agents/explorer.toml`
- `extensions/codex-content/assets/agents/worker.toml`
- `extensions/codex-content/assets/agents/awaiter.toml`

### Files to touch

- `extensions/codex-content/subagents.ts`
- `extensions/codex-content/subagents/index.ts`

### Tasks

- [ ] Define core types:
  - [ ] `AgentProfileConfig`
  - [ ] `ResolvedAgentProfiles`
  - [ ] profile warning/result helpers
- [ ] Add built-in profile registry:
  - [ ] `default`
  - [ ] `explorer`
  - [ ] `worker`
  - [ ] package `awaiter` but mark it hidden
- [ ] Load bundled asset text from `assets/agents/`
- [ ] Parse bundled TOML into profile metadata:
  - [ ] `developer_instructions`
  - [ ] `model`
  - [ ] `model_reasoning_effort`
- [ ] Expose a single helper:
  - [ ] `resolveBuiltInAgentProfiles()`
- [ ] Re-export new helpers from `extensions/codex-content/subagents.ts` if needed for tests

### Expected output of Phase 1

- pure helper layer exists
- built-ins can be resolved without touching child spawn
- tests validate the built-in registry shape

### Test checkpoint

- [ ] built-ins resolve with the expected names
- [ ] `awaiter` is not exposed in the visible list
- [ ] bundled assets parse correctly

### Safe rollback boundary

- profile modules can be reverted independently without touching runtime spawn behavior

---

## Phase 2 — Prompt bootstrap and spawn integration

### Goal

Make `agent_type` change child behavior for built-in profiles.

### Files to add

- `extensions/codex-content/subagents/profiles-apply.ts`

### Files to touch

- `extensions/codex-content/subagents/types.ts`
- `extensions/codex-content/subagents/attachment.ts`
- `extensions/codex-content/subagents/index.ts`
- `extensions/codex-content/subagents/rendering.ts`
- `extensions/codex-content/subagents/results.ts`
- `extensions/codex-content/prompt.ts`
- `extensions/codex-content/subagents.test.ts`

### Tasks

- [ ] Extend durable child types in `extensions/codex-content/subagents/types.ts`:
  - [ ] add `agentType?: string` to `DurableChildRecord`
  - [ ] add `agent_type?: string` to `AgentSnapshot`
- [ ] Add a helper to resolve the requested role name:
  - [ ] empty/omitted => `default`
  - [ ] explicit unknown => error
- [ ] Add a helper to compute effective child settings:
  - [ ] profile default model
  - [ ] profile default reasoning
  - [ ] explicit spawn override
  - [ ] lock behavior when the profile says model/effort is fixed
- [ ] Update `createLiveAttachment()` in `extensions/codex-content/subagents/attachment.ts` to pass child profile bootstrap env:
  - [ ] `PI_CODEX_AGENT_PROFILE_NAME`
  - [ ] `PI_CODEX_AGENT_PROFILE_JSON`
- [ ] Update `extensions/codex-content/prompt.ts` to append role-specific developer instructions during `before_agent_start`
- [ ] Update `spawn_agent` in `extensions/codex-content/subagents/index.ts`:
  - [ ] resolve built-ins first
  - [ ] apply selected profile
  - [ ] persist `agentType`
  - [ ] apply effective model/reasoning choices before sending prompt
  - [ ] include `agent_type` in result details
- [ ] Update snapshot/render helpers so role identity can appear in summaries
- [ ] Keep the first UI change minimal:
  - [ ] show `name [agent_type]` when available

### Expected output of Phase 2

- `agent_type=explorer` and `agent_type=worker` become behaviorally real
- omitted `agent_type` becomes `default`
- child prompt contains the selected role instructions

### Test checkpoint

- [ ] omitted `agent_type` resolves to `default`
- [ ] unknown role returns explicit error
- [ ] profile bootstrap env is passed to the child attachment layer
- [ ] role instructions are injected exactly once
- [ ] durable records store `agentType`
- [ ] display name renders `name [role]`

### Safe rollback boundary

- if Phase 2 fails, revert only the spawn integration and prompt bootstrap while keeping Phase 1 helpers

---

## Phase 3 — Codex config loading for custom roles

### Goal

Load custom Codex-format roles from the user's Codex config.

### Files to add

- `extensions/codex-content/subagents/profiles-codex-config.ts`
- `extensions/codex-content/subagents/profiles-loader.ts`

### Files to touch

- `extensions/codex-content/subagents/profiles.ts`
- `extensions/codex-content/subagents/index.ts`
- `extensions/codex-content/subagents/profiles.test.ts`
- `extensions/codex-content/subagents.test.ts`

### Tasks

- [ ] Add config path resolution helper:
  - [ ] `PI_CODEX_CONFIG_PATH`
  - [ ] `CODEX_HOME/config.toml`
  - [ ] `~/.codex/config.toml`
- [ ] Parse Codex role declarations from config:
  - [ ] `[agents.<name>]`
  - [ ] `description`
  - [ ] `config_file`
  - [ ] `nickname_candidates`
- [ ] Discover role files under `<config-dir>/agents/*.toml`
- [ ] Parse Codex role files:
  - [ ] `name`
  - [ ] `description`
  - [ ] `nickname_candidates`
  - [ ] extract `developer_instructions`
  - [ ] extract `model`
  - [ ] extract `model_reasoning_effort`
- [ ] Merge custom roles on top of built-ins
- [ ] Add warning collection for malformed roles
- [ ] Cache resolved roles in the parent process for the active session
- [ ] Invalidate the cache on:
  - [ ] `session_start`
  - [ ] `session_switch`

### Expected output of Phase 3

- Pi sees Codex custom roles without depending on the Codex runtime
- role names from Codex config become valid `agent_type` values

### Test checkpoint

- [ ] loads roles from config table
- [ ] loads roles from discovered `agents/` files
- [ ] merges metadata from config table and role file
- [ ] malformed roles are skipped with warnings
- [ ] custom role shadows a built-in role of the same name
- [ ] explicit request for a broken role returns availability error

### Safe rollback boundary

- loader modules can be reverted while leaving built-ins functional

---

## Phase 4 — UX parity and hardening

### Goal

Expose roles to the model and user in a Codex-like way.

### Files to touch

- `extensions/codex-content/subagents/index.ts`
- `extensions/codex-content/subagents/rendering.ts`
- `extensions/codex-content/subagents/render.ts`
- `extensions/codex-content/subagents/results.ts`
- `extensions/codex-content/subagents/profiles.ts`
- `extensions/codex-content/subagents/profiles.test.ts`
- `extensions/codex-content/subagents.test.ts`

### Tasks

- [ ] Build runtime role description text for `spawn_agent.parameters.agent_type`
- [ ] List custom roles first, then built-ins not shadowed by custom roles
- [ ] Surface locked model/reasoning metadata in the description
- [ ] Improve `spawn_agent` transcript output to mention the resolved role where practical
- [ ] Include role metadata in any concise result details needed by renderers
- [ ] Keep output compact and Codex-like

### Expected output of Phase 4

- the model can see available roles in the tool schema
- the transcript makes role identity obvious

### Test checkpoint

- [ ] tool description lists built-ins when no custom roles exist
- [ ] tool description lists custom roles before built-ins
- [ ] locked setting notes render correctly
- [ ] renderer output remains stable and compact

---

## File-by-file change list

## `extensions/codex-content/subagents/profiles-types.ts`

Add:

- profile metadata types
- resolved registry types
- warning/result helper types

Keep this file pure.

## `extensions/codex-content/subagents/profiles-builtins.ts`

Add:

- bundled built-in profile definitions
- helper to read packaged TOML assets
- helper to expose visible built-ins only

Keep file-system reads isolated here.

## `extensions/codex-content/subagents/profiles.ts`

Add:

- top-level profile resolution entrypoint
- merge helpers
- spawn-agent description builder

This should be the only module `subagents/index.ts` needs to call directly.

## `extensions/codex-content/subagents/profiles-codex-config.ts`

Add:

- Codex config path resolution
- config TOML parsing for `[agents.*]`
- `agents/` directory discovery

## `extensions/codex-content/subagents/profiles-loader.ts`

Add:

- Codex role file parsing
- metadata merge logic
- warning accumulation

## `extensions/codex-content/subagents/profiles-apply.ts`

Add:

- role-name normalization
- effective model/reasoning precedence logic
- child bootstrap payload builder
- nickname-candidate selection helper

## `extensions/codex-content/subagents/types.ts`

Modify:

- `DurableChildRecord`
- `AgentSnapshot`
- add child-profile env constant names if needed

## `extensions/codex-content/subagents/attachment.ts`

Modify:

- accept profile bootstrap payload in `createLiveAttachment()` options
- pass child profile env vars into the spawned process

## `extensions/codex-content/prompt.ts`

Modify:

- read child profile bootstrap env
- append role-specific instructions after the packaged Codex prompt
- keep dedupe logic strict and deterministic

## `extensions/codex-content/subagents/index.ts`

Modify carefully:

- import profile helpers
- resolve/cached profiles
- apply role in `spawn_agent`
- persist `agentType`
- expose role info in details/render payloads
- invalidate cache on session events

Avoid mixing parsing logic into this file.

## `extensions/codex-content/subagents/rendering.ts`

Modify:

- update display-name helper to include role badge

Keep formatting logic small and isolated.

## `extensions/codex-content/subagents/results.ts`

Modify only if needed:

- preserve Codex JSON result shape
- add role detail only in `details`, not in the main JSON payload unless intentionally changing the contract

## `extensions/codex-content/subagents/profiles.test.ts`

Add focused pure tests for:

- built-ins
- config parsing
- merge behavior
- description builder

## `extensions/codex-content/subagents.test.ts`

Extend integration-leaning tests for:

- spawn role resolution
- child bootstrap metadata
- durable record persistence
- role-aware rendering

---

## Recommended patch batches

Use these PR-sized batches even if you land them locally in one branch.

### Batch A

- add `profiles-types.ts`
- add `profiles-builtins.ts`
- add bundled assets
- add `profiles.test.ts`

### Batch B

- add `profiles-apply.ts`
- update `types.ts`
- update `attachment.ts`
- update `prompt.ts`
- wire minimal built-in role support into `subagents/index.ts`

### Batch C

- add `profiles-codex-config.ts`
- add `profiles-loader.ts`
- update `profiles.ts`
- wire custom role loading into `subagents/index.ts`

### Batch D

- role-aware tool description
- renderer polish
- additional integration tests

---

## Testing order

Run tests in this order while implementing:

1. new pure profile tests
2. existing `extensions/codex-content/subagents.test.ts`
3. any prompt tests affected by child prompt injection

If there is a package-local test command, prefer narrow runs first.

---

## Notes for implementation

- prefer small pure helpers over adding more branching inside `subagents/index.ts`
- do not make the Codex config loader fatal during package startup
- keep the role loader lazy and cacheable
- do not mutate the delegated user task prompt to smuggle developer instructions
- keep the main `spawn_agent` JSON output contract stable unless there is a strong reason to change it
- do not expose `awaiter` in the visible role list yet unless explicitly chosen

---

## Final acceptance checklist

- [ ] built-in profiles exist and are tested
- [ ] built-in `explorer` changes child instructions
- [ ] built-in `worker` changes child instructions
- [ ] `default` is applied when `agent_type` is omitted
- [ ] custom roles load from Codex config
- [ ] custom roles load from `agents/*.toml`
- [ ] role settings can lock model/reasoning behavior
- [ ] `spawn_agent` advertises available roles
- [ ] role identity is stored in durable child state
- [ ] role identity appears in subagent rendering
- [ ] malformed role files are non-fatal and well-handled
- [ ] tests cover the new behavior

---

## Recommended next action

Start with Phase 1, Batch A only.

That keeps the first code change small, pure, and easy to review before touching runtime spawn behavior.
