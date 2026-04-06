# Shared Todos Extraction Design

**Date:** 2026-04-04

## Goal

Extract the current Forge todo workflow into a shared `extensions/todos/` implementation, then consume that shared implementation from both Forge and Codex with extension-specific tool names.

## Approved Product Decision

Use the current Forge todo data shape as the shared contract everywhere for now.

```json
{
  "todos": [
    {
      "content": "Task text",
      "status": "pending | in_progress | completed | cancelled"
    }
  ]
}
```

The existing Codex plan shape will be removed rather than preserved.

## Naming

### Forge

Forge will consume the shared implementation under these public tool names:

- `todos_write`
- `todos_read`

### Codex

Codex will consume the shared implementation under these public tool names:

- `update_plan`
- `read_plan`

This preserves Codex's planning-oriented vocabulary while standardizing the underlying data shape and behavior.

## Current State

### Forge

Forge currently owns the todo implementation inside `extensions/forge-content/workflow/`:

- `todo-tools.ts`
- `todo-state.ts`
- `todo-widget.ts`
- tests alongside those files

It also references todo tool names in:

- `extensions/forge-content/index.ts`
- `extensions/forge-content/prompt/forge-system.md`

### Codex

Codex currently has a separate workflow implementation centered on plan management:

- `extensions/codex-content/workflow/plan.ts`
- `extensions/codex-content/workflow/types.ts`
- `extensions/codex-content/workflow/index.ts`
- `extensions/codex-content/workflow/request-user-input.ts`

It also references workflow and compatibility tool names in:

- `extensions/codex-content/tools/index.ts`

## Desired Architecture

Create a new shared extension/module at `extensions/todos/` that owns:

- todo state transitions
- todo snapshot restoration from session history
- todo tool registration
- todo rendering
- todo widget behavior
- tests for shared behavior

Forge and Codex should become thin integration layers that configure names and prompt text while delegating behavior to the shared module.

## Shared Registration API

The shared module should expose a configurable registration function that allows callers to provide:

- write tool name
- read tool name
- display labels for renderCall output
- widget/status keys
- prompt snippet/guideline text
- any extension-specific descriptions needed for the tool definitions

This avoids duplicating implementation while allowing each extension to present the right public API.

## Behavior to Preserve

The extracted shared implementation should preserve the current Forge todo behavior:

- incremental updates using `todos`
- matching by normalized `content`
- `cancelled` removes an item
- at most one `in_progress`
- session reconstruction from previous write tool results
- compact result rendering
- compact single-line widget when there is an `in_progress` task
- hidden widget when there is no `in_progress`
- agent-readable reminder in tool response content when pending tasks remain and nothing is `in_progress`

## Codex Migration

Codex should stop using the old plan implementation.

### Remove / retire

- `extensions/codex-content/workflow/plan.ts`
- old plan-specific types in `extensions/codex-content/workflow/types.ts`
- old `update_plan` plan-shape behavior

### Keep

- `request_user_input` remains in Codex workflow

### Replace with shared todos

Codex workflow will register shared todos as:

- `update_plan` for write
- `read_plan` for read

The new `update_plan` will accept Forge todo input shape, not the old Codex plan shape.

## Forge Migration

Forge should stop owning the todo implementation directly.

### Replace

Current local registration in `extensions/forge-content/workflow/` should be replaced with shared registration from `extensions/todos/`.

### Public names

Forge public tools should become:

- `todos_write`
- `todos_read`

## Tool Set Updates

Tool-set configuration must be updated to reflect the new names.

### Forge

Update `extensions/forge-content/index.ts` so the active Forge tool set includes:

- `todos_write`
- `todos_read`

instead of:

- `todo_write`
- `todo_read`

### Codex

Update `extensions/codex-content/tools/index.ts` so compatibility and active-tool logic references:

- `update_plan`
- `read_plan`

and no longer assumes Forge todo names for Codex.

## Prompt and Docs Updates

Update any prompt guidance that references old Forge names such as:

- `todo_write`
- `todo_read`

At minimum, update:

- `extensions/forge-content/prompt/forge-system.md`

Additional docs or exported constants should be updated if they mention the old names or old Codex plan semantics.

## File Plan

### Create

- `extensions/todos/index.ts`
- `extensions/todos/todo-tools.ts`
- `extensions/todos/todo-state.ts`
- `extensions/todos/todo-widget.ts`
- `extensions/todos/todo-tools.test.ts`
- `extensions/todos/todo-state.test.ts`

### Modify

- `extensions/forge-content/workflow/index.ts`
- `extensions/forge-content/index.ts`
- `extensions/forge-content/prompt/forge-system.md`
- `extensions/codex-content/workflow/index.ts`
- `extensions/codex-content/workflow/types.ts`
- `extensions/codex-content/tools/index.ts`

### Remove or simplify

- `extensions/forge-content/workflow/todo-tools.ts`
- `extensions/forge-content/workflow/todo-state.ts`
- `extensions/forge-content/workflow/todo-widget.ts`
- `extensions/codex-content/workflow/plan.ts`
- `extensions/codex-content/workflow/plan.test.ts`

Exact deletion vs thin re-export wrapper can be decided during implementation, but the end state should have the shared logic owned by `extensions/todos/`.

## Risks

### Prompt/tool-name drift

Prompt templates and active-tool lists can easily fall out of sync with renamed tools. This could make agents reference tool names that no longer exist.

### Session reconstruction coupling

The current reconstruction logic keys off the write tool name in session history. Shared registration must preserve correct reconstruction for each aliased write tool name.

### Codex compatibility break

Removing the old plan shape is an intentional breaking change. Any existing prompts/tests assuming `explanation`, `plan`, `items`, `step`, or `description` will need to be updated.

## Testing Strategy

Shared tests should cover:

- todo state creation/update/removal
- single `in_progress` enforcement
- snapshot restoration
- write tool rendering
- read tool rendering
- widget visibility and content
- agent-readable reminder text
- per-extension alias registration

Integration checks should verify:

- Forge registers `todos_write` / `todos_read`
- Codex registers `update_plan` / `read_plan`
- Codex still registers `request_user_input`
- active tool sets include the renamed tools

## Out of Scope

These are intentionally not included in this migration:

- preserving old Codex plan data shape
- adding `blocked` support to shared todos
- adding explanation/note/id fields to shared todo items
- redesigning request-user-input behavior
- broader workflow refactors unrelated to this extraction

## Success Criteria

The migration is complete when:

1. `extensions/todos/` is the single owner of todo workflow behavior.
2. Forge uses the shared implementation with `todos_write` and `todos_read`.
3. Codex uses the shared implementation with `update_plan` and `read_plan`.
4. The old Codex plan implementation is removed.
5. Prompts/tool sets/tests are updated to the new names and shape.
6. Shared and integration tests pass.
