# Remove Forge Mode Design

Date: 2026-04-10
Status: Approved in conversation

## Goal

Remove Forge mode completely from this package, including Forge-specific tools, prompt assets, skills/resources, settings/UI references, package registration, and tests. Any existing persisted `toolSet: "forge"` value must migrate to `pi` behavior.

## Context

The repo currently supports multiple tool-set modes (`pi`, `codex`, `forge`, `droid`). Forge mode is implemented as a dedicated extension under `extensions/forge-content`, plus shared wiring in settings, tool-set resolution, subagent entrypoints, docs, and tests.

Forge is not an isolated feature toggle. It affects:

- package extension registration
- tool-set parsing and active tool resolution
- settings UI labels and mode cycling
- session snapshot parsing
- subagent prompt wiring
- editor/test fixtures and cross-mode tests
- repository docs and package metadata

## Requirements

1. Remove Forge mode entirely.
2. Remove Forge-branded skills/resources with it.
3. Ensure old persisted Forge settings/session entries fall back to Pi.
4. Leave the remaining modes working: `pi`, `codex`, `droid`.
5. Remove user-facing Forge references from docs and settings.

## Non-goals

- Changing Codex or Droid behavior beyond what is required to remove Forge references.
- Broad refactors unrelated to tool-set cleanup.
- Backward-compatible retention of hidden Forge internals.

## Chosen approach

Use a hard-delete approach:

- delete `extensions/forge-content/**`
- remove all Forge references from shared tool-set infrastructure
- normalize legacy `forge` values to `pi`
- remove package/docs/test references

This gives the cleanest end state and matches the requested "full removal".

## Design

### 1. Delete Forge extension and assets

Remove the entire `extensions/forge-content` tree, including:

- extension registration entrypoint
- Forge system prompt asset
- Forge-specific tools (`fs_search`, `patch`, `followup`, `todos_*`)
- Forge workflow glue
- Forge resource discovery
- Forge-branded skill files
- Forge-specific tests

### 2. Remove Forge from package registration and docs

Update:

- `package.json`
  - remove Forge from description/keywords if still present
  - remove `./extensions/forge-content/index.ts` from `pi.extensions`
  - remove Forge test target from the `test` script
- `README.md`
  - remove Forge package description and any install/usage references

### 3. Simplify shared mode definitions

Update tool-set domain types and registry so only these modes remain:

- `pi`
- `codex`
- `droid`

Required changes include:

- removing `forge` from `ToolSetPack`
- removing Forge label formatting
- removing Forge contributions/conflict rules/mode ordering
- updating any unions/tests/fixtures that still mention Forge

### 4. Migrate legacy Forge state to Pi

Persisted Forge values may exist in global settings or session snapshots. After removal:

- config parsing should treat `forge` as invalid and normalize to `pi`
- session parsing should treat `forge` as invalid and normalize to `pi`

This preserves startup behavior without keeping Forge as a supported option.

### 5. Update UX flows

Update settings command/UI behavior so Forge disappears from:

- mode picker values
- mode labels and descriptions
- CLI parsing/help text
- keyboard shortcut cycle order

New cycle order:

- `pi -> codex -> droid -> pi`

### 6. Remove Forge prompt hooks from subagents

Subagent entrypoints currently import/register Forge system prompt wiring. Since Forge mode is removed, those imports and registrations should be deleted unless another remaining feature still depends on them.

### 7. Cross-test cleanup

Adjust or remove tests that reference Forge in:

- shared tool-set resolution
- settings parsing/UI/cycling
- editor skill completion fixtures if Forge-specific
- droid/codex/subagent tests that use Forge as an alternate mode fixture

Keep only tests that protect real remaining contracts, per repo guidance.

## Expected edit areas

Primary:

- `extensions/forge-content/**` (delete)
- `package.json`
- `README.md`

Shared settings/tool-set plumbing:

- `extensions/settings/config.ts`
- `extensions/settings/ui.ts`
- `extensions/settings/index.ts`
- `extensions/settings/session.ts`
- related tests
- `extensions/shared/toolset-registry.ts`
- related resolver tests

Likely cross-extension cleanup:

- `extensions/subagents/child-entry.ts`
- `extensions/subagents/interactive-child-entry.ts`
- any tests/fixtures referencing Forge in `editor`, `droid-content`, or elsewhere

## Risks

1. **Hidden Forge references remain**
   - Mitigation: repo-wide search for `forge`/`Forge` after edits.

2. **Legacy sessions fail to resolve a mode**
   - Mitigation: explicitly normalize `forge` to `pi` in config and session parsers.

3. **Cross-mode tests break due to narrowed unions**
   - Mitigation: update representative tests and remove low-value Forge-only cases.

4. **Subagent startup behavior changes unexpectedly**
   - Mitigation: verify subagent-related imports/tests after prompt hook removal.

## Verification plan

At minimum run:

- targeted repo-wide search for remaining Forge references
- `bun run typecheck`
- targeted `bun test` for affected areas if available

If targeted checks are clean, run broader verification as practical:

- `bun run test`

## Success criteria

- no selectable Forge mode remains
- no registered Forge extension remains
- no Forge-specific assets/skills remain
- old `forge` settings/session state resolve to Pi behavior
- tests/typecheck pass for the updated codebase
