# Subagent Public Model Removal Design

## Goal

Remove the public `model` argument from the `spawn_agent` and `Task` tool interfaces without removing internal model support used by custom subagent profiles and lifecycle defaults.

## Current State

Both adapter entry points currently expose `model` as a public tool parameter:

- `src/subagents/subagents/tool-adapters-codex.ts` exposes `model` on `spawn_agent`.
- `src/subagents/subagents/tool-adapters-task.ts` exposes `model` on `Task`.

Each adapter also forwards the value into `lifecycle.spawn(...)` as `requestedModel` and includes the model in tool call rendering through `formatSubagentModelLabel(...)`.

Internal model selection is broader than these public parameters:

- custom subagent profiles may specify a `model`
- lifecycle resolution may inherit defaults from the parent session
- profile application still supports `requestedModel` for non-tool callers

## Approved Behavior

After this change:

1. `spawn_agent` no longer declares a public `model` parameter.
2. `Task` no longer declares a public `model` parameter.
3. Neither adapter forwards a model override from tool params into `lifecycle.spawn(...)`.
4. Custom subagent profile `model` values continue to work.
5. Inherited internal model defaults continue to work.
6. Calls that still try to pass `model` through these two tools should fail schema validation instead of being silently accepted.

## Implementation Approach

Recommended approach: make this a narrow adapter-level contract change and leave lifecycle/profile internals intact.

This keeps the user-facing API consistent with the intended product behavior while avoiding unnecessary churn in lower-level utilities that may still validly support explicit model selection for non-tool callers.

### File Responsibilities

- `src/subagents/subagents/tool-adapters-codex.ts`
  - Remove `model` from `spawn_agent` parameters.
  - Stop passing `params.model` into `requestedModel`.
  - Stop rendering a model label from tool args.

- `src/subagents/subagents/tool-adapters-task.ts`
  - Remove `model` from `Task` parameters.
  - Stop passing `params.model` into `requestedModel`.
  - Stop rendering a model label from tool args.

- `src/subagents/subagents/rendering.ts`
  - Keep shared model-label helpers only if still used elsewhere.
  - Do not expand scope into broader rendering cleanup unless imports become dead.

- `src/subagents/subagents/tool-adapters-role-descriptions.test.ts`
  - Add focused assertions that public adapter schemas no longer expose `model`.

## Data Flow

The `spawn_agent` and `Task` tools should continue to resolve subagent behavior like this:

1. Validate the public tool input.
2. Pass the prompt, role, and reasoning-related inputs into lifecycle spawn.
3. Let lifecycle/profile resolution determine the effective model from profile configuration or inherited defaults.

The removed path is only the direct public override:

`tool params.model -> requestedModel -> applySpawnAgentProfile(...)`

That path should disappear for these two adapters, while profile-defined model selection remains unchanged.

## Error Handling

- Unknown public fields such as `model` should be rejected by tool schema validation.
- Existing role/profile resolution errors should remain unchanged.
- Missing required prompt/message behavior should remain unchanged.

## Testing

Keep tests focused on meaningful public behavior:

1. Assert `spawn_agent` parameters no longer contain a `model` property.
2. Assert `Task` parameters no longer contain a `model` property.
3. Leave lifecycle/profile tests unchanged unless an adapter test directly depends on the removed public field.

No new tests are needed for profile-driven model support because that behavior already belongs to profile/lifecycle coverage rather than these adapter contracts.

## Out of Scope

- Removing `requestedModel` support from lifecycle internals.
- Removing `model` support from custom subagent profile definitions.
- Changing reasoning effort or complexity behavior.
- Broader subagent API cleanup beyond these two public tools.
