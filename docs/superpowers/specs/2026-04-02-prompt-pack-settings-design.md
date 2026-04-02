# Prompt Pack And Package Settings Design

Date: 2026-04-02
Status: Approved in chat, pending spec review loop

## Summary

This change introduces two new extensions:

1. `extensions/prompt-pack/` for generic system prompt pack selection and injection.
2. `extensions/settings/` for package-level configuration UI and config writes, exposed through the `/tungthedev` command.

The initial shared package setting is `systemPrompt`, stored in the global Pi settings file under the package namespace:

```json
{
  "tungthedev/pi": {
    "systemPrompt": "codex"
  }
}
```

Allowed values are `"codex"`, `"forge"`, or `null`. Missing or invalid values behave as `null`.

## Goals

- Replace the dedicated `codex-system-prompt` extension with a generic prompt-pack extension.
- Support selecting a system prompt pack from `none`, `codex`, and `forge`.
- Introduce a single package settings entrypoint, `/tungthedev`, that can later host settings for other extensions in this package.
- Store package settings in Pi's global settings file at `~/.pi/agent/settings.json`.
- Keep the Forge extension focused on Forge runtime behavior rather than owning prompt injection.

## Non-Goals

- Adding project-local settings support.
- Migrating other extension settings into the new package settings extension in this change.
- Reworking the built-in Pi `/settings` UI.
- Changing Forge mode behavior, Codex subagent behavior, or package filtering behavior.

## User Experience

### Commands

The package settings extension registers `/tungthedev`.

Supported forms:

- `/tungthedev`
  - Opens the package settings TUI.
- `/tungthedev system-prompt`
  - Opens the package settings TUI focused on the `System prompt pack` setting.
- `/tungthedev system-prompt codex`
- `/tungthedev system-prompt forge`
- `/tungthedev system-prompt none`
  - Writes the setting directly and shows a success notification.

### Settings UI

The initial settings UI contains one setting:

- `System prompt pack`
  - `None`
  - `Codex`
  - `Forge`

The UI should be implemented as a package settings surface, not as a one-off system prompt picker, so additional settings can be added later without introducing more top-level commands.

### Behavior

- The chosen value is written to global Pi settings only.
- A successful settings change takes effect on the next user turn without requiring `/reload`.
- A successful change shows a notification indicating the selected prompt pack.
- Invalid direct command arguments show a warning and do not write config.
- If the setting is missing or invalid, prompt injection is disabled.

## Architecture

### 1. `extensions/prompt-pack/`

Responsibilities:

- Read the effective prompt-pack selection from global Pi settings.
- Resolve the selected pack to a prompt builder.
- Inject the chosen prompt during `before_agent_start`.
- Remain a no-op when the selected value is `null`, missing, or invalid.

This extension becomes the single owner of package-managed prompt injection.

### 2. `extensions/settings/`

Responsibilities:

- Own package-scoped configuration parsing and writing.
- Register the `/tungthedev` command.
- Render the package settings TUI.
- Validate and persist `tungthedev/pi.systemPrompt`.

This extension is intentionally broader than system prompt configuration, even though only one setting is implemented initially.

### 3. `extensions/forge-content/`

Responsibilities after refactor:

- Keep mode state, tools, workflow, resources, and Forge commands.
- Export and reuse Forge prompt-building helpers.
- Share live Forge runtime state with `prompt-pack`, especially the currently selected Forge mode.
- Stop injecting the Forge prompt directly in `before_agent_start`.

### 4. Existing Codex Prompt Logic

The current logic in `extensions/codex-system-prompt/` is retained as reusable prompt-pack helper code, but the dedicated extension entrypoint is removed from the package manifest.

## Config Model

### Settings Shape

The package writes to the global Pi settings file using a package namespace key:

```json
{
  "tungthedev/pi": {
    "systemPrompt": "forge"
  }
}
```

Type:

```ts
type TungthedevSettings = {
  systemPrompt?: "codex" | "forge" | null;
};
```

### Read Semantics

- Read from `~/.pi/agent/settings.json`.
- Read the effective package setting fresh for prompt injection so command-driven changes apply on the next turn without restart or reload.
- Parse the root object defensively.
- Read `settings["tungthedev/pi"]` only if it is an object.
- Read `systemPrompt` only if it is `"codex"`, `"forge"`, or `null`.
- Treat any other value as `null`.

### Write Semantics

- Preserve unrelated settings and unrelated package namespaces.
- Create the namespaced object if missing.
- Write `null` for the `none` selection so the intent is explicit.
- Use atomic write behavior consistent with the repo's existing settings helpers.

## Prompt Pack Resolution

### Supported Packs

- `null`
  - No extra prompt injection.
- `codex`
  - Append the Codex prompt derived from the bundled and fallback model catalogs.
- `forge`
  - Append the Forge system prompt plus Forge runtime context.

### Resolution Flow

On `before_agent_start`:

1. Read package settings.
2. Resolve `systemPrompt`.
3. If `null`, return no prompt change.
4. If `codex`, build the Codex prompt using the current model and Codex personality data.
5. If `forge`, build the Forge prompt using the current cwd, active tools, Forge mode, shell, and home directory.
6. Merge the selected prompt with `event.systemPrompt`.

### Prompt Composition Rules

- Preserve the base `event.systemPrompt`.
- Append the selected pack output with a blank line separator.
- Keep Codex injection idempotent as it is today.
- Keep Forge prompt generation deterministic for the same runtime inputs.
- Do not combine multiple packs in the same turn.

## Detailed Refactor Plan

### A. New `prompt-pack` helpers

Create helper modules that separate package config, prompt resolution, and pack-specific builders.

Suggested layout:

```text
extensions/prompt-pack/
  index.ts
  settings.ts
  settings.test.ts
  packs/
    codex.ts
    codex.test.ts
    forge.ts
    forge.test.ts
```

Notes:

- `packs/codex.ts` can absorb the reusable parts of the current `codex-system-prompt` logic.
- `packs/forge.ts` should call the existing Forge prompt builder instead of duplicating prompt logic.

### B. New `settings` extension

Suggested layout:

```text
extensions/settings/
  index.ts
  index.test.ts
  config.ts
  config.test.ts
  ui.ts
```

Implementation notes:

- `config.ts` owns reading and writing the `tungthedev/pi` namespace.
- `ui.ts` owns the settings widget and any command argument parsing helpers.
- `index.ts` wires the `/tungthedev` command.

### C. `forge-content` refactor

- Remove the `before_agent_start` prompt injection handler from `extensions/forge-content/index.ts`.
- Keep `buildForgePrompt()` as the source of Forge prompt composition.
- Extract shared Forge runtime helpers so both `forge-content` and `prompt-pack` read the same live state.
- The shared runtime surface must expose the current Forge mode and active tool snapshot used for prompt construction.
- `/forge`, `/sage`, `/muse`, and `/forge-mode ...` must update that shared state before the next `before_agent_start` run so the Forge prompt reflects the current mode.

### D. `codex-system-prompt` deprecation

- Remove `./extensions/codex-system-prompt/index.ts` from the package manifest in `package.json`.
- Update tests accordingly.
- Keep reusable prompt logic by moving it into the new prompt-pack implementation rather than deleting it.

## Error Handling

### Settings

- Invalid JSON in the global settings file should not crash command handling.
- If settings cannot be parsed for a write, return a user-facing error notification and avoid destructive overwrites.
- If the namespace exists but is not an object, replace only that namespace entry during a successful direct write.

### Prompt Injection

- Missing Codex catalog data should degrade to no Codex prompt instead of throwing.
- Missing Forge runtime metadata should still allow Forge prompt generation with partial runtime context, as the current builder already supports optional fields.
- Any unexpected prompt-pack resolution error should fail closed to the base system prompt.

## Testing Strategy

Keep tests focused on meaningful runtime behavior.

### Unit Tests

- package settings read returns `null` when namespace or value is missing
- package settings read accepts `codex`, `forge`, and `null`
- package settings write preserves unrelated root settings
- package settings write preserves unrelated `tungthedev/pi` fields if introduced later
- command argument parser accepts `system-prompt codex|forge|none`
- command argument parser rejects unknown values
- prompt-pack resolver returns no-op for invalid settings

### Prompt Tests

- Codex pack still resolves model-specific prompt and fallback behavior
- Forge pack builds a prompt containing Forge instructions and runtime context
- selected pack appends to the incoming system prompt
- no pack leaves the incoming system prompt unchanged

### Integration-Style Tests

- `/tungthedev system-prompt forge` writes the expected namespaced config
- `before_agent_start` uses the stored config to inject Forge or Codex prompt

## Package Manifest And Docs

### Manifest changes

Update `package.json`:

- remove `./extensions/codex-system-prompt/index.ts`
- add `./extensions/prompt-pack/index.ts`
- add `./extensions/settings/index.ts`
- update test script paths to include the new extension tests and stop targeting `codex-system-prompt`

### Documentation changes

Update package docs only where the shipped surface changes:

- replace `codex-system-prompt` in the package description and README extension list
- mention `/tungthedev` as the package settings command

## Migration Notes

- Users who had the old Codex prompt extension installed through this package will now get prompt injection only when `tungthedev/pi.systemPrompt` is set to `"codex"`.
- There is no automatic migration in this change because the old extension had no package-managed toggle.
- Default behavior after upgrading is no extra package prompt until explicitly selected.

## Open Decisions Resolved

- Settings scope: global only
- command name: `/tungthedev`
- extension folder for package settings: `extensions/settings/`
- package config namespace: `tungthedev/pi`

## Implementation Summary

Deliver the feature by centralizing prompt selection in `prompt-pack`, centralizing package config in `settings`, and treating `/tungthedev` as the long-term package settings entrypoint rather than a single-purpose command.
