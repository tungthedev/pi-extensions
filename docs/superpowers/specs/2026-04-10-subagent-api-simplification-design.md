# Subagent API Simplification Design

Date: 2026-04-10

## Summary

This design updates the current subagent system to adopt selected ideas from Codex subagent v2 while keeping the existing shared Pi subagent lifecycle core.

The goal is to simplify the public API, replace opaque UUID-based public identifiers with caller-supplied names, reduce the built-in role surface, and align tool guidance with Codex's stronger delegation instructions.

This is intentionally **not** a full MultiAgentV2 port. We are keeping the current runtime model for spawning, waiting, stopping, persistence, and shared lifecycle behavior.

## Goals

- Simplify the public `spawn_agent` interface.
- Use a human-readable caller-supplied public identifier instead of exposing UUIDs.
- Keep current `fork_context`, `interactive`, `run_in_background`, `model`, and `reasoning_effort` support.
- Remove structured `items` from the public subagent APIs.
- Rename `send_input` to `send_message`.
- Keep `Task` tools as a separate facade over the same shared subagent core.
- Reduce built-in profiles to `default` and `researcher`, and require explicit instructions for all built-ins.
- Adopt Codex-style delegation guidance in the tool description.

## Non-Goals

- Do not implement mailbox-driven MultiAgentV2 semantics.
- Do not implement path-based addressing or `/root/...` canonical task paths.
- Do not add `list_agents`.
- Do not change `wait_agent` to mailbox-based semantics.
- Do not rewrite the lifecycle runtime from scratch.
- Do not preserve backward compatibility with the old public Codex-facing subagent API.

## Current State

The current implementation exposes two related public surfaces over the same lifecycle core:

- Codex-style tools:
  - `spawn_agent`
  - `send_input`
  - `wait_agent`
  - `close_agent`
- Task-style tools:
  - `Task`
  - `TaskOutput`
  - `TaskStop`

The shared lifecycle is implemented in `extensions/subagents/subagents/lifecycle-service.ts` and currently uses generated UUIDs as agent ids.

Current Codex spawn supports a broad schema:
- `task`
- `context`
- `message`
- `items`
- `agent_type`
- `fork_context`
- `workdir`
- `model`
- `reasoning_effort`
- `run_in_background`
- `interactive`
- `name`

Current follow-up uses `send_input`, and public results expose `agent_id` / `task_id`.

## Proposed Design

## 1. Shared runtime strategy

We will keep the existing shared subagent lifecycle service and continue using adapter-specific tool layers on top of it.

The lifecycle service should continue to own:
- spawning
- child attachment / child launch
- prompt delivery
- resume/follow-up delivery
- waiting
- stopping
- durable record persistence
- live attachment tracking
- profile resolution and application

The public API changes should be handled primarily in the adapter layer and in the identity model used by the shared store/lifecycle.

This keeps the architecture stable while allowing a breaking cleanup of the user-facing contract.

## 2. Public identifier model

Use **`name`** as the sole public identifier across both the Codex-style and Task-style subagent APIs.

### Rules

- `name` is caller-supplied.
- `name` is required for `spawn_agent`.
- `name` must use only:
  - lowercase letters
  - digits
  - underscores
- `name` must be unique among live child agents in the current session/runtime.
- Duplicate live names should fail fast with a clear error.
- Public APIs must not expose UUIDs.

### Rationale

This keeps the model human-readable and aligns with the Codex v2 principle of caller-owned naming, while intentionally using `name` instead of `task_name` so the Pi API reads more naturally in an agent-centric system.

## 3. Spawn semantics

### New `spawn_agent` schema

`spawn_agent` should accept:

```json
{
  "name": "required lowercase name",
  "message": "required plain-text task",
  "agent_type": "optional role name",
  "fork_context": true,
  "model": "optional model override",
  "reasoning_effort": "optional reasoning override",
  "interactive": false,
  "run_in_background": true
}
```

### Removed fields

Remove these public parameters from `spawn_agent`:
- `task`
- `context`
- `items`
- `workdir`
- optional label-style `name` field from the old API

### Workdir behavior

Subagents always inherit the parent cwd.

There is no public workdir override.

### Output

`spawn_agent` should return:

```json
{
  "name": "agent_name"
}
```

Optionally include `nickname` only if there is a strong reason to preserve it for UI/tooling, but the intended public direction is to simplify around `name` as the stable handle.

### Internal handling

Internally, the lifecycle may still use implementation details not exposed publicly, but all public references and result payloads should use `name`.

## 4. Follow-up messaging

Rename:
- `send_input` -> `send_message`

### New `send_message` schema

```json
{
  "target": "required agent name",
  "message": "required text",
  "interrupt": false
}
```

### Removed fields

Remove:
- `items`
- legacy alias fields such as `id` / `agent_id`

### Behavior

`send_message` should preserve the current resume/follow-up semantics already implemented in the lifecycle service.

In other words, this is a naming and schema simplification, not a mailbox/v2 semantic rewrite.

## 5. Wait and close semantics

### `wait_agent`

Keep the current semantics for now:
- target-based wait
- completion/status based behavior
- no mailbox rewrite

The public target field(s) should be aligned with the new name-based identifier model.

### `close_agent`

Keep the current lifecycle behavior, but target by `name` instead of `agent_id`.

Because this is not full v2 path-tree addressing, subtree/path semantics are out of scope.

## 6. Task tool alignment

Keep the `Task` family as a separate facade, but align its public identifiers with the same `name` model.

### `Task`

Keep:
- `prompt`
- `subagent_type`
- `description`
- `complexity`
- `run_in_background`
- `model`

Replace:
- resume by `task_id` -> resume by `name`

Return:
- `name` instead of `task_id`

### `TaskOutput`

Replace:
- `task_id` parameter -> `name`

### `TaskStop`

Replace:
- `task_id` parameter -> `name`

### Rationale

This preserves the simpler task-oriented facade while converging both public surfaces on one consistent identity model.

## 7. Built-in profiles

Replace the current built-in set with only:
- `default`
- `researcher`

Remove built-ins:
- `explorer`
- `worker`
- `reviewer`

### Built-in profile rules

All built-in profiles must provide explicit `developer_instructions`.

This means:
- `default` must gain explicit instructions.
- `researcher` replaces `explorer` and should be focused on deep repository/code research.

### Researcher intent

`researcher` should be the built-in role for:
- deep repo investigation
- code tracing
- architecture understanding
- evidence-backed findings
- no code modification unless explicitly designed otherwise in the profile

The current `explorer` prompt provides a strong starting point and should be adapted/renamed rather than lightly re-described.

## 8. Tool description guidance

Adopt the Codex-style `spawn_agent` tool guidance text pattern.

Key rules to include:
- Only use `spawn_agent` when the user explicitly asks for sub-agents, delegation, or parallel agent work.
- Requests for depth, thoroughness, research, or detailed analysis do not themselves authorize spawning.
- Plan locally before delegating.
- Delegate bounded, concrete, non-overlapping tasks.
- Avoid delegating immediate blocking work when the main agent should do it directly.
- Use `wait_agent` sparingly.
- Do useful local work while the delegated agent runs.
- Split coding work into disjoint write scopes.

### Scope of adoption

We only need to adopt the guidance/instruction style and content for the current Pi tool surface. We are not required to adopt every schema or runtime assumption from Codex v2.

## 9. Compatibility strategy

This is a **breaking change**.

There will be no backward-compatibility shim for the old public Codex-style API.

### Breaking changes

- `spawn_agent` requires `name` and `message`.
- `spawn_agent` no longer accepts `task`, `context`, `items`, or `workdir`.
- `send_input` is removed and replaced by `send_message`.
- `send_message` does not accept `items`.
- Public `agent_id` / `task_id` fields are removed in favor of `name`.
- `TaskOutput` / `TaskStop` stop using `task_id`.
- Built-in profiles `explorer`, `worker`, and `reviewer` are removed.

## 10. Error handling

Required user-facing validation errors:
- invalid `name` format
- missing `name`
- missing `message`
- duplicate live `name`
- missing target `name`
- blank `message`

Errors should remain concise and model-friendly.

## 11. Testing strategy

High-value tests should cover:

### Spawn API
- `spawn_agent` requires `name`
- `spawn_agent` requires `message`
- invalid `name` format rejects
- duplicate live `name` rejects
- removed fields are not accepted by the schema
- returned payload uses `name` instead of `agent_id`

### Messaging
- `send_message` is registered instead of `send_input`
- `send_message` accepts text + interrupt only
- removed `items` are not accepted

### Task facade
- `Task` returns `name`
- `Task` resume uses `name`
- `TaskOutput` uses `name`
- `TaskStop` uses `name`

### Profiles
- built-ins resolve to only `default` and `researcher`
- both built-ins have explicit instructions
- `researcher` replaces `explorer`

### Guidance
- `spawn_agent` description includes the new delegation guidance

Per repo test guidance, avoid low-value schema pinning beyond the meaningful contract changes above.

## 12. Implementation outline

1. Update Codex tool adapter schema for `spawn_agent`.
2. Rename `send_input` to `send_message` in the Codex adapter.
3. Remove `items` handling from Codex spawn/follow-up flows.
4. Introduce public `name` validation and uniqueness checks.
5. Replace public `agent_id` / `task_id` payloads with `name`.
6. Update `Task`, `TaskOutput`, and `TaskStop` schemas/results.
7. Update profile built-ins and bundled assets.
8. Replace the current `spawn_agent` description with Codex-style delegation guidance adapted to the Pi API.
9. Update tests to reflect the new contract.

## Open Questions Resolved

- Caller-supplied name or runtime-generated identifier? -> Caller-supplied `name`
- Breaking change or compatibility layer? -> Breaking change
- Keep Task facade? -> Yes
- Task identifier field? -> Use `name`
- Spawn identifier field name? -> Use `name`, not `task_name`
- Keep `Task.prompt` or rename to `message`? -> Keep `prompt`
- Keep `items` in messaging? -> Remove `items`
- Built-in roles? -> Only `default` and `researcher`

## Final Recommendation

Implement this as a public API simplification over the existing shared subagent core. Keep the lifecycle behavior broadly intact, but tighten the schemas, naming model, built-in profile set, and tool guidance so the system is easier to understand and closer to the selected Codex subagent v2 design principles.