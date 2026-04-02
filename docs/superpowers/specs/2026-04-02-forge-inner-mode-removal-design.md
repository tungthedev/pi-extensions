# Remove Inner Forge Modes And Commands Design

Date: 2026-04-02
Status: Approved in chat, pending spec review loop

## Summary

Simplify `extensions/forge-content/` into a single static Forge harness.

Keep the package-level `toolSet` switch in `extensions/settings/` as the only remaining mode boundary:

- `toolSet: "codex"`
- `toolSet: "forge"`

Inside `forge-content`, remove all inner mode concepts (`forge`, `sage`, `muse`), remove all Forge slash commands, and remove the `/forge-todos` command.

The Sage research persona should continue to exist, but it should live only in `extensions/subagents/` via the existing `explorer` profile, keeping the exact current Sage prompt text.

## Goals

- Keep `extensions/settings/` as the single place where users switch between Codex and Forge tool sets.
- Make `forge-content` a static tool surface with no internal mode switching.
- Remove all Forge slash commands:
  - `/forge`
  - `/sage`
  - `/muse`
  - `/forge-mode`
- Remove `/forge-todos` and rely on the todo widget for visibility.
- Preserve Sage as a research persona by keeping its exact prompt text in the `explorer` subagent profile.
- Simplify Forge prompt generation so it no longer includes inner mode state.

## Non-Goals

- Removing the package-level `toolSet` setting from `extensions/settings/`.
- Changing the Codex tool set or Codex command behavior.
- Reworking the `subagents` system beyond keeping Sage prompt text in `explorer`.
- Redesigning the Forge todo widget.
- Adding new commands, new tool presets, or new prompt packs.

## Product Decisions

### 1. Only one top-level mode remains

The only user-facing mode boundary after this change is:

- `toolSet = codex`
- `toolSet = forge`

This remains managed through `extensions/settings/` and the `/tungthedev tool-set ...` surface.

There is no second layer of Forge-only modes after this change.

### 2. Forge becomes static

When `toolSet` is `forge`, `forge-content` should apply one stable Forge preset and one stable Forge prompt shape.

The Forge tool preset remains implementation-oriented and should be the current Forge preset without mode branching:

- `read`
- `write`
- `shell`
- `fs_search`
- `patch`
- `followup`
- `todo_write`
- `todo_read`

### 3. Sage moves to subagents only

The current Sage behavior should no longer exist as an inner Forge mode.

Instead:

- the `explorer` built-in subagent remains the research-focused path
- its prompt should keep the exact current Sage prompt text
- no Forge slash command should switch into Sage anymore

This keeps the research persona available without maintaining two separate mechanisms for the same concept.

### 4. Muse is removed outright

`muse` should be deleted rather than preserved in hidden or internal form.

No prompt, command, tool preset, or runtime state should refer to Muse after the change.

## Architecture Changes

### `extensions/forge-content/`

Remove inner mode infrastructure and collapse Forge to a single preset.

Expected changes:

- remove command registration from `agents/commands.ts`
- delete or retire `agents/modes.ts`
- delete or retire `runtime-state.ts`
- simplify `index.ts` so it only applies the static Forge preset when `toolSet === "forge"`
- remove command-based mode mutation logic entirely

`forge-content` should still own:

- Forge tools
- Forge workflow tools and widget
- Forge bundled resources
- Forge prompt building support

But it should no longer own:

- mode switching
- mode status labels
- mode-specific prompt append logic

### `extensions/prompt-pack/`

Forge prompt generation should stop depending on shared Forge runtime mode state.

The Forge prompt builder should instead build from static Forge runtime inputs only:

- cwd
- active tools
- shell
- home directory
- date if already supported

It should not inject:

- current inner mode
- mode instructions
- mode labels

### `extensions/subagents/`

Keep `explorer` as the research persona and preserve the exact current Sage prompt text there.

If the current `explorer` profile already contains that text, no behavior change is needed beyond ensuring the Forge cleanup does not introduce duplicate Sage concepts elsewhere.

## File-Level Plan

### Remove or simplify

- `extensions/forge-content/agents/commands.ts`
- `extensions/forge-content/agents/modes.ts`
- `extensions/forge-content/runtime-state.ts`

These may be deleted outright if no longer needed, or collapsed if a tiny helper remains useful for static preset application.

### Modify

- `extensions/forge-content/index.ts`
  - apply one static Forge tool preset when `toolSet === "forge"`
  - stop registering Forge commands
  - stop reading or syncing inner mode state

- `extensions/forge-content/workflow/todo-tools.ts`
  - remove `/forge-todos`
  - keep `todo_write`, `todo_read`, and widget behavior unchanged

- `extensions/forge-content/prompt/build-system-prompt.ts`
  - remove `mode` and `modeInstructions` from prompt assembly

- `extensions/prompt-pack/packs/forge.ts`
  - stop depending on Forge runtime mode state
  - build the Forge prompt from static context only

- Forge tests under `extensions/forge-content/` and `extensions/prompt-pack/`
  - remove mode-oriented assertions
  - add static-preset and prompt-shape assertions where needed

## Runtime Behavior

### When `toolSet = codex`

- Codex compatibility tools remain active
- Forge does not override the tool surface
- no Forge command surface exists

### When `toolSet = forge`

- Forge applies a single static Forge tool preset
- no inner mode or mode status is shown
- Forge todo widget still appears when todos exist
- prompt-pack may still inject the Forge prompt if selected, but that prompt should not mention inner modes

## Prompt Rules

After this change, the Forge prompt should describe a single Forge harness.

It should not contain dynamic language implying a switchable inner mode such as:

- current mode
- active Forge mode
- mode-specific instruction block

It may still include general runtime context such as:

- current working directory
- shell
- home directory
- current date
- active tools

## Testing Strategy

Keep tests focused on runtime behavior that matters.

### Update tests to remove obsolete expectations

- remove tests that assert `forge`, `sage`, and `muse` mode lists exist
- remove tests that expect Forge command registration
- remove tests that expect `/forge-todos`

### Add or keep focused coverage for

- Forge static tool preset is applied only when `toolSet === "forge"`
- Codex continues to win when `toolSet === "codex"`
- Forge prompt generation works without mode state
- todo widget behavior remains intact without `/forge-todos`
- `explorer` still carries the Sage research prompt text

## Risks And Mitigations

### Risk: prompt-pack still imports deleted Forge mode helpers

Mitigation:

- update Forge prompt-pack integration first or in the same patch
- run focused `forge-content` and `prompt-pack` tests together

### Risk: hidden status UI still references removed mode keys

Mitigation:

- remove Forge mode status writes from `forge-content/index.ts`
- confirm no stale status key remains after session start and before agent start

### Risk: research persona becomes duplicated or inconsistent

Mitigation:

- treat `explorer` as the only surviving Sage path
- remove any Sage text from Forge-specific prompt/runtime code

## Definition Of Done

- `toolSet` in `extensions/settings/` remains the only mode-like switch
- `forge-content` has no inner `forge`/`sage`/`muse` mode system
- `/forge`, `/sage`, `/muse`, `/forge-mode`, and `/forge-todos` no longer exist
- Forge applies one static tool preset when enabled
- Forge prompt generation has no inner mode dependency or mode wording
- `explorer` remains the Sage research persona with the exact current Sage prompt text
- focused tests pass for the updated Forge, prompt-pack, subagent, and settings behavior
