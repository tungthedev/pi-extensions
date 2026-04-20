# Prompt Source CustomPrompt Design

## Goal

Align Codex and Droid prompt selection with Pi native prompt construction by supplying them as `customPrompt` sources instead of doing late `before_agent_start` prompt replacement.

## Current State

The current extension flow builds prompt bodies for `codex` and `droid` in their own modules and injects them during `before_agent_start`.

- `codex` and `droid` can either append to the current Pi prompt or replace it entirely.
- `SYSTEM.md` is also handled in `before_agent_start` and currently replaces the full prompt when enabled and present.
- `includePiPromptSection` controls whether Codex or Droid is appended after Pi's prompt or replaces it.

This means Codex and Droid are not using Pi's native `customPrompt` path, and `SYSTEM.md` bypasses Pi's normal post-processing such as project context, skills, and runtime metadata.

## Approved Behavior

Prompt source selection should follow this precedence:

1. If `SYSTEM.md` is enabled and present, use its contents as `customPrompt` in all modes.
2. Otherwise, if the tool set is `codex`, use the resolved Codex prompt as `customPrompt`.
3. Otherwise, if the tool set is `droid`, use the resolved Droid prompt as `customPrompt`.
4. Otherwise, in `pi` mode, do not provide a `customPrompt`, allowing Pi to build its default native prompt.

`SYSTEM.md` should no longer replace the entire already-built prompt during `before_agent_start`. It should instead become the selected `customPrompt`, allowing Pi's normal prompt assembly to continue afterward.

`includePiPromptSection` should be removed. Prompt selection should be driven only by tool set plus the optional `SYSTEM.md` override.

## Implementation Approach

Recommended approach: introduce a single prompt-source resolver that returns the correct `customPrompt` value before Pi builds the final system prompt.

This keeps prompt precedence explicit, removes append-vs-replace branching, and reuses Pi's native prompt builder for all common sections.

### File Responsibilities

- `src/codex-content/system-prompt.ts`
  - Continue owning Codex prompt body resolution from the model catalog.
  - Stop replacing or appending the final system prompt during `before_agent_start`.
  - Expose prompt-source selection helpers as needed.

- `src/droid-content/system-prompt.ts`
  - Continue owning Droid prompt body assembly from its asset files.
  - Stop replacing or appending the final system prompt during `before_agent_start`.
  - Expose prompt-source selection helpers as needed.

- `src/system-md/state.ts`
  - Continue resolving and reading `SYSTEM.md` from the git root.
  - Stop modeling `SYSTEM.md` as a prompt replacement contribution.
  - Instead expose a plain prompt body that can be selected as `customPrompt`.

- Shared prompt selection module
  - Introduce a helper that selects one prompt source in priority order: `SYSTEM.md`, `codex`, `droid`, or none.
  - Return the selected prompt body rather than an append/replace contribution.

- Pi mode settings
  - Remove `includePiPromptSection` from config parsing, writing, and UI.
  - Keep `toolSet` and `systemMdPrompt` settings.

## Data Flow

The final prompt should be assembled in two phases:

1. The extension selects an optional `customPrompt` string based on the current tool set and `SYSTEM.md` state.
2. Pi native prompt construction builds the final system prompt using that `customPrompt` when present, or the Pi default scaffold when absent.

Because `customPrompt` still goes through Pi native assembly, the final prompt continues to receive:

- project context files
- injected skills when available
- current date and working directory
- other normal Pi prompt sections that are applied after `customPrompt`

## Error Handling

- If `SYSTEM.md` is enabled but missing, fall back to tool-set-based prompt selection.
- If the tool set is `codex` but no matching model prompt is found, preserve existing Codex fallback behavior.
- If the tool set is `droid`, continue choosing model-family-specific Droid sections based on the active model ID.
- If no prompt source is selected, Pi mode should continue using the native default prompt.

## Testing

Update tests so they validate prompt-source selection instead of append-vs-replace composition.

Cover these cases:

1. `pi` mode returns no mode-specific `customPrompt` when `SYSTEM.md` is disabled or missing.
2. `codex` mode selects the Codex prompt as `customPrompt`.
3. `droid` mode selects the Droid prompt as `customPrompt`.
4. Enabled and present `SYSTEM.md` overrides all modes and becomes the selected `customPrompt`.
5. Enabled but missing `SYSTEM.md` falls back to the current tool set.
6. Settings parsing and UI no longer expose `includePiPromptSection`.

## Out of Scope

- Changing the contents of Codex prompt bodies beyond using them as `customPrompt`.
- Changing the contents of Droid prompt assets beyond using them as `customPrompt`.
- Changing Pi native prompt construction behavior itself.
- Adding new prompt sources beyond `SYSTEM.md`, `codex`, and `droid`.
