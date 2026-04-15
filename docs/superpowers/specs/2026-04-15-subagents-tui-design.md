# Subagents TUI Design

Date: 2026-04-15

## Summary

Replace the current `/subagents` text command in `extensions/subagents/` with an interactive TUI for browsing and managing subagent roles. Fully remove the old Codex/TOML-based role management path and switch persistence and discovery to the `pi-subagents` markdown role format and locations.

This work should selectively port proven patterns from `../pi-subagents` while keeping scope intentionally narrow:

- manage subagent profiles/roles only
- no chain management
- no broader agent fields like tools, skills, output, extensions, or chain settings

## Goals

- `/subagents` opens a searchable overlay list
- up/down + enter opens role detail
- detail view supports:
  - `e` edit description and prompt
  - `m` edit model and thinking via model picker
  - `d` delete custom role with confirmation
- list includes an option to create a new subagent
- builtin roles are listed as readonly base definitions
- builtin roles can be overridden by creating a custom role with the same name
- support both user and project scope for custom roles
- replace old text subcommands with a TUI-first command

## Non-goals

- chain management
- importing the full `pi-subagents` agent manager feature set
- support for tools, skills, extensions, output, reads, progress, interactive, or max depth in the UI
- preserving Codex role file support
- hybrid TOML + markdown compatibility layer

## Source of Truth

### Storage model

Use `pi-subagents`-style markdown files with YAML frontmatter as the only persistence format for custom roles.

### Locations

Custom roles are resolved from:

1. project scope: nearest `.agents/<name>.md`
2. user scope: `~/.agents/<name>.md`
3. builtin scope: extension-shipped builtin role assets

Project overrides user. User overrides builtin.

Project scope is anchored to the current session/command `cwd` and resolved by walking upward to the nearest directory containing `.agents/`. Runtime lookup and `/subagents` must use the exact same anchor rule so nested directories and worktrees behave consistently.

Legacy `~/.pi/agent/agents` and Codex `config.toml`/`agents/*.toml` are not written or loaded by the new role manager.

### File format

Supported fields:

- `name`
- `description`
- `model`
- `thinking`

The markdown body stores the system prompt.

#### Name identity rules

`name` is the canonical identity. The filename must match the saved name: `<name>.md`.

Implications:

- on load, the manager should reject or normalize files whose frontmatter `name` does not match the filename stem
- on save, the file is always written using the current role name as the filename
- renaming a custom role renames the backing file as part of the same operation
- renaming a builtin is not allowed; overriding a builtin keeps the same name as the builtin being shadowed
- collision checks apply against the target scope before rename/save completes

Example:

```md
---
name: reviewer
description: Review code for regressions and risks
model: openai/gpt-5
thinking: high
---

Your system prompt here.
```

## Architecture

### Command entrypoint

`/subagents` becomes a TUI-only command.

Behavior:

- if `ctx.hasUI` is true: open the manager overlay
- otherwise: return a short message that `/subagents` requires the interactive UI

The current text command parser and `create/update/delete/list/help` flow in `extensions/subagents/commands.ts` should be removed.

### Role management layer

Add a small role-focused storage/discovery layer in `extensions/subagents/` inspired by `../pi-subagents/agents.ts` and `../pi-subagents/agent-serializer.ts`, but trimmed to role-only concerns.

Proposed modules:

- `roles/types.ts`
- `roles/discovery.ts`
- `roles/serializer.ts`
- `roles/storage.ts`

Responsibilities:

- load builtin role definitions
- load user and project markdown role files
- build both:
  - a **layered definitions model** for the TUI
  - an **effective-by-name map** for runtime spawning
- expose metadata for the UI and runtime:
  - `name`
  - `description`
  - `model`
  - `thinking`
  - `prompt`
  - `source: builtin | user | project`
  - `filePath?`
  - `overridesBuiltin?`
  - `effectiveSource`
  - `shadowedBy?`

The layered model is required because the UI must be able to show builtin, user, and project definitions separately even when they share the same name. The effective-by-name map is required because spawn resolution should choose exactly one role per name after precedence is applied.

### Runtime role resolution

The runtime resolver that currently builds subagent role profiles must also switch to the markdown role layer so that spawn behavior and `/subagents` stay consistent.

Current Codex-oriented profile resolution should be replaced with:

- builtin markdown-backed role definitions
- user markdown roles from `~/.agents`
- project markdown roles from nearest `.agents`

The runtime resolver should be parameterized by `cwd` instead of relying on a single global environment-only cache. Any cache that remains must be keyed by the resolved project root (or absence of one) so project-scoped role lookup stays correct across nested directories and worktrees.

This same cwd-aware resolver must also be used anywhere the extension exposes role lists or role descriptions to users or tools, including tool adapter help/schema text and any other "available roles" surfaces, so discovery text and actual spawn resolution cannot drift.

## TUI Design

### Reuse strategy

Port the `pi-subagents` interaction model where possible, but trim it to role management only.

Useful source references:

- `../pi-subagents/agent-manager.ts`
- `../pi-subagents/agent-manager-list.ts`
- `../pi-subagents/agent-manager-detail.ts`
- `../pi-subagents/agent-manager-edit.ts`
- `../pi-subagents/text-editor.ts`

### Overlay structure

Likely files:

- `ui/subagents-manager.ts`
- `ui/subagents-list.ts`
- `ui/subagents-detail.ts`
- `ui/subagents-edit.ts`

### List view

Requirements:

- searchable list
- keyboard navigation with up/down + enter
- include builtin, user, and project roles
- include a first-class `Create new subagent` row

Suggested row metadata:

- name
- source badge: `[builtin]`, `[user]`, `[proj]`
- effective override indicator when a custom role shadows another definition
- short description preview

The list should show layered entries, not just effective entries. For example, if `reviewer` exists in builtin, user, and project scopes, the list can show all three rows with the effective one marked and the lower-precedence ones visibly shadowed/read-only as appropriate.

### Detail view

Display:

- name
- source/scope
- description
- model
- thinking
- prompt preview/full scrollable prompt

Actions:

- `e` edit description + prompt
- `m` edit model + provider and thinking
- `d` delete custom role with confirm

For builtin roles:

- shown as readonly base definitions
- `e` or `m` should begin a create-override flow rather than editing the builtin in place
- `d` is disabled

### Edit flow

Editable fields:

- name (custom roles only)
- description
- prompt
- model
- thinking

Model picker:

- searchable
- prefers available models from `ctx.modelRegistry.getAvailable()` when that runtime surface is available in the command context
- persists the chosen model as provider-qualified `provider/model`
- treats provider as part of the selected model identity rather than a separate persisted field
- falls back to a plain text model entry flow if model registry enumeration is unavailable in the command context

Manual model entry rules:

- require provider-qualified input in the form `provider/model`
- reject bare model IDs in the manual fallback path instead of guessing a provider
- validate only the basic shape at save time; runtime model availability is still validated separately when the role is used
- if the user enters an invalid value, keep the edit screen open with an inline validation error

Thinking picker:

- reuse the `pi-subagents` thinking-level selection pattern
- persist one of: `minimal`, `low`, `medium`, `high`, `xhigh`
- treat `off` as unset/omitted in the saved file

### Create new role flow

From the list:

1. choose scope: `user` or `project`
2. enter name
3. fill description, prompt, model, thinking
4. save markdown file
5. refresh list and open detail

Validation:

- allow names that match builtin roles to create overrides
- block duplicate names within the same chosen scope
- use conservative name validation similar to the existing subagent naming rules

## Builtin Override Semantics

Builtin roles are always shown as readonly base definitions.

A user can override a builtin by creating a custom role with the same name in user or project scope.

Behavior:

- project custom role shadows user custom role and builtin
- user custom role shadows builtin
- deleting an override reveals the next underlying definition after refresh

This is a role-level shadowing model, not a partial field override model.

## Removal Plan

Remove old Codex role management support from `extensions/subagents/`:

- no Codex config discovery
- no `agents/*.toml`
- no TOML serializers/parsers for role management
- no old text `/subagents create|update|delete|list|help` interface

This is an intentional breaking change for existing Codex/TOML-managed custom roles. The implementation should make the break explicit by doing all of the following:

- stop loading old Codex role files at runtime
- show a one-time or per-session warning when legacy Codex role files are detected, pointing users to the new markdown role locations
- note the breaking change in release notes/changelog
- do **not** silently attempt partial compatibility

A follow-up migration helper can be added separately, but it is not part of this scope.

Delete or refactor Codex-specific modules and tests accordingly, including the current command tests that only cover text parsing and TOML persistence.

## Testing Strategy

Keep tests focused on runtime and user-visible behavior.

### Add or keep

1. layered resolution precedence
   - builtin + user + project definitions with the same name are all represented in the layered model
   - runtime effective resolution chooses project over user over builtin
2. serialization contract
   - markdown frontmatter + prompt body round-trip correctly
   - filename and frontmatter `name` stay aligned
3. builtin override flow
   - creating override from builtin writes same-name markdown role in chosen scope
   - builtin row remains visible/read-only after override exists
4. delete behavior
   - deleting a project override reveals the user override if present, otherwise builtin
   - deleting a user override reveals builtin when no project override exists
5. command behavior
   - `/subagents` opens TUI when UI is available
   - `/subagents` returns a helpful message without UI
6. model persistence
   - selected model is stored as `provider/model`
   - model picker fallback still allows manual entry when enumeration is unavailable
7. thinking persistence
   - chosen thinking level round-trips through load/save
8. rename behavior
   - renaming a custom role renames its file
   - rename collision checks prevent duplicates in target scope
9. project-scope lookup
   - nearest `.agents` resolution works from nested directories/worktrees
10. builtin TUI actions
   - builtin `e`/`m` flows create an override instead of mutating the builtin
11. legacy Codex warning behavior
   - legacy Codex role files/config are detected
   - warning is emitted
   - legacy roles are not loaded into the new markdown resolver

### Remove

- old text command parsing tests
- old TOML role serialization tests
- Codex-specific role config tests related only to removed persistence paths

## Risks

- runtime and TUI can drift if only the manager is migrated; both must switch to the same role store
- a full copy of `pi-subagents` manager could reintroduce out-of-scope fields unless trimmed deliberately
- scope resolution for project `.agents` must be consistent with runtime role lookup

## Recommended Execution Order

1. add markdown role discovery and serialization layer
2. switch runtime role resolution to use it
3. remove old Codex role support and obsolete tests
4. port/build the slim role manager TUI
5. add focused tests for precedence, save/delete, and command behavior

## Next Action

Start by implementing the new markdown role discovery/serialization layer and wiring runtime profile resolution to it before building the TUI. This establishes the correct source of truth and prevents the new interface from landing on top of a deprecated storage model.
