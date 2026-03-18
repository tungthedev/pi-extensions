# Extension Refactor Plan

Date: 2026-03-17

## Goal

Refactor the two extensions in this repo to improve maintainability, portability, testability, and clarity without changing their user-facing behavior.

Primary focus areas:

- split oversized files by responsibility
- remove duplicated helper logic
- stabilize brittle integrations
- add tests around the highest-risk logic

This document is a planning artifact only. It does not imply behavior changes beyond the explicitly listed fixes.

---

## Current pain points

### `extensions/codex-content/`

- `index.ts` mixes event orchestration, exploration state, UI rendering, and tool wrappers
- `subagents.ts` combines process lifecycle, RPC transport, registry persistence, session reconstruction, state transitions, tool registration, and rendering
- `codex-tools.ts` mixes shared execution helpers with six concrete tool implementations
- some runtime values are captured at module load (`process.cwd()` / derived paths)
- `shell_command` is currently brittle across non-POSIX shells
- `list_dir` output does not fully match its documented contract
- test coverage is concentrated in `apply-patch` only

### `extensions/ext-manager/`

- `index.ts` mixes controller state, view building, overlay orchestration, action handling, and command registration
- helper logic is duplicated across `local.ts` and `packages.ts`
- configured-local discovery can treat missing configured files as valid entries
- package discovery depends on parsing human-readable `pi list` output
- async UI actions are not centrally guarded
- local apply flow is best-effort, but not structured for clearer retry/recovery behavior

---

## Refactor principles

1. Keep public behavior stable unless a bug fix is explicitly called out.
2. Prefer small modules with one main responsibility.
3. Centralize shared types and helpers.
4. Move stateful logic behind service or reducer-style modules.
5. Add tests before or during each risky extraction.
6. Make wiring files shallow and declarative.

---

## Target layout

## 1. `extensions/codex-content/`

### Current layout

```text
extensions/codex-content/
  index.ts
  prompt.ts
  codex-tools.ts
  workflow-tools.ts
  subagents.ts
  apply-patch.ts
  apply-patch.test.ts
  image-utils.ts
```

### Target layout

```text
extensions/codex-content/
  index.ts
  prompt.ts

  shared/
    paths.ts
    text.ts
    tool-results.ts

  compatibility-tools/
    index.ts
    types.ts
    runtime.ts
    read-file.ts
    list-dir.ts
    grep-files.ts
    shell-command.ts
    apply-patch.ts
    view-image.ts

  renderers/
    common.ts
    bash.ts
    edit.ts
    write.ts
    exploration.ts

  exploration/
    types.ts
    state.ts
    ui.ts
    events.ts

  workflow/
    index.ts
    plan.ts
    request-user-input.ts
    types.ts

  subagents/
    index.ts
    types.ts
    registry.ts
    rpc.ts
    attachment.ts
    lifecycle.ts
    state.ts
    persistence.ts
    session.ts
    render.ts

  patch/
    index.ts
    types.ts
    parser.ts
    apply.ts
    matching.ts
    patch.test.ts

  images/
    index.ts
    exif.ts
    photon.ts
    resize.ts
```

### File mapping

#### `extensions/codex-content/index.ts`

Keep as a wiring entrypoint only.

Target responsibilities:

- register prompt injection
- register compatibility tools
- register workflow tools
- register subagent tools
- register native Pi tool wrappers and their renderers
- install exploration event listeners

Move out of current `index.ts`:

- exploration grouping and bookkeeping -> `exploration/state.ts`
- exploration widget/status sync -> `exploration/ui.ts`
- tool event handlers -> `exploration/events.ts`
- `renderBashResult` -> `renderers/bash.ts`
- `renderEditResult` -> `renderers/edit.ts`
- `renderWriteResult` -> `renderers/write.ts`
- path/text formatting helpers -> `shared/text.ts` and `renderers/common.ts`

#### `extensions/codex-content/codex-tools.ts`

Split by tool and shared runtime helpers.

Target responsibilities by file:

- `compatibility-tools/runtime.ts`
  - command execution helper
  - output truncation helper
  - absolute path resolution
  - shared safety limits/constants

- `compatibility-tools/read-file.ts`
  - `read_file` schema and execute logic
  - indentation-mode helpers if they stay tool-specific

- `compatibility-tools/list-dir.ts`
  - directory traversal
  - numbering/type-label formatting
  - contract fix for output format

- `compatibility-tools/grep-files.ts`
  - ripgrep execution
  - stat sorting

- `compatibility-tools/shell-command.ts`
  - shell selection/argument strategy
  - shell portability fix

- `compatibility-tools/apply-patch.ts`
  - tool wrapper around internal patch engine

- `compatibility-tools/view-image.ts`
  - image tool wrapper around image helpers

- `compatibility-tools/index.ts`
  - `registerCodexCompatibilityTools()` only

#### `extensions/codex-content/workflow-tools.ts`

Split by feature.

- `workflow/plan.ts`
  - plan normalization
  - plan widget lines
  - status/icon helpers
  - `update_plan` execute + render

- `workflow/request-user-input.ts`
  - option normalization
  - freeform input collection
  - `request_user_input` execute + render

- `workflow/types.ts`
  - workflow detail/result types

- `workflow/index.ts`
  - top-level registration and per-session reset

#### `extensions/codex-content/subagents.ts`

This is the highest-priority split.

- `subagents/types.ts`
  - `DurableChildRecord`
  - `LiveChildAttachment`
  - `RpcResponse`
  - `AgentSnapshot`
  - tool payload/result types

- `subagents/registry.ts`
  - in-memory maps
  - require/update helpers
  - snapshot construction

- `subagents/persistence.ts`
  - durable registry event persistence
  - durable registry reconstruction helpers

- `subagents/rpc.ts`
  - JSONL protocol helpers
  - pending response resolution
  - `sendRpcCommand`

- `subagents/attachment.ts`
  - spawn/attach child process
  - stdout/stderr buffering
  - close/detach mechanics

- `subagents/session.ts`
  - session-file reads
  - last assistant text extraction
  - resumable checks

- `subagents/state.ts`
  - status conversions
  - status derivation
  - explicit transition helpers

- `subagents/lifecycle.ts`
  - attach/resume/wait/close orchestration
  - queueing operations
  - wait-for-idle logic

- `subagents/render.ts`
  - concise renderers for subagent tools

- `subagents/index.ts`
  - `registerCodexSubagentTools()` only
  - tool schemas and wiring to services

#### `extensions/codex-content/apply-patch.ts`

Split internal engine from entry wrapper.

- `patch/types.ts`
  - hunk and result types
- `patch/parser.ts`
  - parse/unwrap/validate patch text
- `patch/matching.ts`
  - match strategies and sequence seeking
- `patch/apply.ts`
  - virtual file state and file mutation logic
- `patch/index.ts`
  - public exports

Keep behavior unchanged.

#### `extensions/codex-content/image-utils.ts`

Split image concerns.

- `images/exif.ts`
  - orientation parsing
- `images/photon.ts`
  - photon loading and wasm fallback patching
- `images/resize.ts`
  - resize/orientation application pipeline
- `images/index.ts`
  - public exports

---

## 2. `extensions/ext-manager/`

### Current layout

```text
extensions/ext-manager/
  index.ts
  local.ts
  packages.ts
  types.ts
  ui.ts
```

### Target layout

```text
extensions/ext-manager/
  index.ts
  types.ts

  shared/
    fs.ts
    summary.ts
    settings.ts
    paths.ts

  controller/
    index.ts
    local-state.ts
    package-state.ts

  local/
    discover.ts
    mutate.ts
    types.ts

  packages/
    discover-installed.ts
    discover-entrypoints.ts
    filters.ts
    settings.ts
    types.ts

  views/
    root.ts
    local-scope.ts
    packages.ts
    package-detail.ts
    actions.ts

  ui/
    stack-palette.ts
    palette-render.ts
```

### File mapping

#### `extensions/ext-manager/index.ts`

Keep only command and shortcut registration.

Move out:

- `ExtensionManagerController` -> `controller/index.ts`
- local and package mutation bookkeeping -> `controller/local-state.ts`, `controller/package-state.ts`
- root/local/package view builders -> `views/*.ts`
- overlay opening logic -> `views/actions.ts` or `ui/overlay.ts` if needed
- action handling loop -> `views/actions.ts`

#### `extensions/ext-manager/local.ts`

Split discovery from mutation.

- `local/discover.ts`
  - configured/local root scanning
  - path resolution from settings
  - dedupe and sort
  - missing configured-file bug fix

- `local/mutate.ts`
  - `setLocalExtensionState()`

- `shared/summary.ts`
  - move duplicated summary parsing helper here

- `shared/fs.ts`
  - `fileExists()` and other tiny filesystem helpers

#### `extensions/ext-manager/packages.ts`

Split concerns into package discovery, entrypoint discovery, filter logic, and settings persistence.

- `packages/discover-installed.ts`
  - `discoverInstalledPackages()`
  - parser isolation for `pi list`
  - sample-output fixture tests

- `packages/discover-entrypoints.ts`
  - manifest resolution
  - convention fallback scanning
  - path/glob handling

- `packages/filters.ts`
  - `getPackageFilterState()`
  - filter matching
  - marker update logic

- `packages/settings.ts`
  - settings read/write
  - package-entry merge/update

- `shared/paths.ts`
  - relative path normalization helpers shared where appropriate

#### `extensions/ext-manager/ui.ts`

Split rendering and interaction.

- `ui/stack-palette.ts`
  - component state and input handling

- `ui/palette-render.ts`
  - box drawing
  - padding/truncation helpers

Optional follow-up:

- `ui/errors.ts`
  - async action guard and user notification adapter

---

## Shared extraction opportunities across both extensions

These can happen later if it feels useful, but should not block the first split.

```text
extensions/shared/
  fs.ts
  paths.ts
  summary.ts
  text.ts
```

Possible shared candidates:

- file existence helper
- relative-path normalization
- summary extraction from extension source files
- small string truncation helpers

Recommendation: do not introduce repo-wide shared modules until the extension-local splits are complete. Keep the first pass local to each extension to avoid premature coupling.

---

## Implementation phases

## Phase 0: safety net

Before refactoring structure:

- add test coverage for existing behavior in:
  - `extensions/ext-manager/packages.ts`
  - `extensions/ext-manager/local.ts`
  - `extensions/codex-content/codex-tools.ts`
  - selected `subagents.ts` pure helpers
- capture representative fixtures for:
  - `pi list` output parsing
  - settings file merge behavior
  - `read_file` indentation mode
  - `list_dir` output expectations

Deliverables:

- new tests with no production behavior changes

## Phase 1: bug-fix and contract alignment

Apply minimal behavior fixes before moving many files:

- fix `shell_command` shell invocation strategy
- fix `list_dir` output to match the documented contract, or update the contract text if numbering/type-labels are intentionally not desired
- fix missing configured-local file handling
- avoid `ctx.ui` usage when `ctx.hasUI` is false in ext-manager command path
- guard async palette actions against unhandled rejections

Deliverables:

- small targeted code changes
- tests covering each fix

## Phase 2: extract shared helpers inside each extension

### `codex-content`

- extract text/result helpers used by renderers
- extract path/runtime helpers from `codex-tools.ts`

### `ext-manager`

- extract `fileExists`, `truncate`, `readSummary`
- extract path/settings helpers

Deliverables:

- no behavior changes
- reduced duplication

## Phase 3: split `ext-manager`

Reason for doing this first:

- smaller blast radius than `subagents`
- easier to validate manually
- clears out duplicated helper logic early

Steps:

1. create `shared/`, `controller/`, `local/`, `packages/`, `views/`, `ui/`
2. move controller class into `controller/index.ts`
3. move local/package-specific state helpers into dedicated files
4. move view builders into `views/*.ts`
5. split `ui.ts` into component vs rendering helpers
6. leave `index.ts` as thin command/shortcut registration

Deliverables:

- equivalent UI behavior
- improved unit-testability of views and controllers

## Phase 4: split `codex-content` except subagents

Steps:

1. extract renderers from `index.ts`
2. extract exploration state and event binding
3. split `codex-tools.ts` into per-tool modules
4. split `workflow-tools.ts`
5. split patch and image internals only if tests are already in place

Deliverables:

- `index.ts` becomes orchestration-only
- tool modules become easier to reason about independently

## Phase 5: split `subagents`

This should happen after tests exist for core lifecycle behavior.

Steps:

1. extract types and registry helpers
2. extract RPC transport helpers
3. extract process attach/detach lifecycle
4. extract persistence/reconstruction logic
5. extract state transitions into explicit helpers
6. extract tool renderers and tool registration wiring
7. keep end-to-end behavior unchanged during the split

Deliverables:

- a service-oriented subagent subsystem
- clearer ownership boundaries
- easier debugging of resume/attach/close flows

## Phase 6: optional repo-wide shared modules

Only after both extensions have stabilized.

Potential moves:

- extension summary parsing
- path normalization helpers
- filesystem helper wrappers

---

## Proposed order of pull requests

### PR 1

- add tests for existing ext-manager package/local logic
- add tests for codex compatibility tool helpers

### PR 2

- fix shell portability
- fix `list_dir` contract mismatch
- fix missing configured-file handling
- add async action guards in ext-manager UI flow

### PR 3

- extract ext-manager shared helpers
- split ext-manager controller/views/ui modules

### PR 4

- extract codex renderers and exploration modules
- split compatibility tools by file
- split workflow tools

### PR 5

- split patch internals and image internals if still needed

### PR 6

- split subagent runtime into registry/rpc/lifecycle/persistence modules

### PR 7

- optional shared cross-extension utility consolidation

---

## Success criteria

The refactor is successful if:

- `extensions/codex-content/index.ts` is mainly wiring and tool registration
- `extensions/codex-content/subagents.ts` no longer exists as a monolith
- `extensions/ext-manager/index.ts` is mainly command registration and top-level flow
- helper duplication between `local.ts` and `packages.ts` is removed
- high-risk behaviors have tests
- external commands and settings parsing are isolated behind small modules
- public commands and tools continue to work with the same names and general behavior

---

## Non-goals

- redesigning the extension manager UX
- changing public tool names
- changing package settings schema
- changing subagent durability model
- replacing the patch engine implementation

---

## Immediate next step

Start with **Phase 0 + Phase 1**:

1. add tests around current behavior
2. land the shell/list-dir/local-discovery/UI-safety fixes
3. then begin the ext-manager split before touching subagents
