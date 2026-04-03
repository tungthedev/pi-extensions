# Forge-On-Pi V1 Implementation Plan

Date: 2026-04-02

## Goal

Build a Forge-like Pi package under `extensions/forge-content/` that feels like a dedicated coding harness rather than a thin Pi customization.

The first version should cover four areas:

- system prompt composition with skill and tool hint injection
- Forge-style tool surface and tool contracts
- Forge-style workflow state and progress visibility
- Forge-style tool rendering and mode switching

This is an implementation plan only. It is not the implementation itself.

---

## Desired outcome

After this work, `extensions/forge-content/` should provide a credible Forge-style experience on top of Pi's extension/runtime model.

Specifically:

- the agent runs with a Forge-style system prompt rather than the default Pi coding prompt
- dynamic prompt blocks include project guidelines, runtime system info, active-tool hints, and available skills
- the package exposes a Forge-like tool surface, starting with the most important coding and workflow tools
- tool renderers make the transcript feel intentionally Forge-like, not generic Pi output
- users can switch between Forge-like modes such as implementation, research, and planning without leaving Pi
- todo/progress state is visible and branch-safe

---

## Success criteria

- `extensions/forge-content/` exists as a standalone package with a clean runtime entrypoint
- a Forge-style base prompt is loaded deterministically from package-local assets
- per-turn prompt injection adds dynamic context blocks without clobbering the base prompt accidentally
- bundled skills and prompt templates are discovered through Pi's native resource-discovery flow
- the package provides first-class workflow tools for `todo_write` and `todo_read`
- the package provides a useful first tool set: `shell`, `fs_search`, `patch`, and `followup`, plus file reading support
- tool prompt hints are driven by `promptSnippet` and `promptGuidelines`, so active-tool selection changes prompt behavior cleanly
- tool rendering is customized for the important Forge-like tools
- mode switching changes both prompt instructions and active tools
- tests cover the runtime contracts that matter, not just static strings

---

## Implementation strategy

Build this as a Pi-native package, not a literal port of Forge internals.

That means:

- let Pi own session management, event flow, skills, prompts, context files, and tool execution
- use package-local prompt assets and extension hooks to create Forge behavior
- use custom tools only where Forge semantics differ materially from Pi's built-ins
- preserve Pi-native capabilities where they already solve the problem well

Land the work in ten slices:

1. package skeleton and runtime entry
2. base Forge system prompt
3. dynamic context injection
4. bundled resource discovery
5. workflow state and todo tools
6. core Forge tool surface
7. tool prompt hints and behavioral rules
8. Forge-style rendering
9. Forge-like modes and presets
10. test hardening and example scenarios

Main sequencing rule:

- do not start with semantic search or subagents
- first establish prompt composition, workflow state, and the first useful local tool set
- only add advanced features once the basic harness behavior feels coherent

---

## Patch order

## Phase 1 — Package skeleton and runtime entry

### Goal

Create a dedicated extension package with clear internal boundaries so prompt logic, tools, renderers, and workflows do not collapse into one large file.

### Files to add

- `extensions/forge-content/package.json`
- `extensions/forge-content/index.ts`
- `extensions/forge-content/README.md`
- `extensions/forge-content/prompt/`
- `extensions/forge-content/resources/`
- `extensions/forge-content/tools/`
- `extensions/forge-content/renderers/`
- `extensions/forge-content/workflow/`
- `extensions/forge-content/agents/`

### Files to touch

- `extensions/`
- `extensions/codex-content/compatibility-tools/index.ts`
- `extensions/codex-content/workflow/index.ts`

### Tasks

- [x] Create a standalone package root at `extensions/forge-content/`
- [x] Add a top-level `index.ts` that wires together:
  - [x] prompt setup
  - [x] resource discovery
  - [x] workflow registration
  - [x] tool registration
  - [x] mode switching
- [ ] Create subdirectories for `prompt`, `tools`, `renderers`, `workflow`, `resources`, and `agents`
- [x] Keep the extension modular from the start instead of growing one monolithic file
- [x] Reuse the package structure patterns already proven in `extensions/codex-content/`

### Description

This phase establishes the implementation boundary for the whole project. The package should be usable as a standalone Pi extension and easy to reason about when future phases add more tools and modes.

### Expected output of Phase 1

- a loadable `forge-content` package exists
- the package has a stable entrypoint and folder layout
- later phases can add functionality without reorganizing the package again

### Test checkpoint

- [ ] package loads without runtime errors
- [ ] entrypoint registers cleanly in a Pi session
- [ ] no-op baseline startup works before tools and prompts are added

### Safe rollback boundary

- this phase can be reverted independently because it only creates package structure and entry wiring

---

## Phase 2 — Base Forge system prompt

### Goal

Replace the default Pi coding persona with a Forge-style base prompt that captures Forge's tone, execution style, and guardrails.

### Files to add

- `extensions/forge-content/prompt/forge-system.md`
- `extensions/forge-content/prompt/build-system-prompt.ts`

### Files to touch

- `extensions/forge-content/index.ts`
- `crates/forge_repo/src/agents/forge.md`
- `templates/forge-custom-agent-template.md`

### Tasks

- [x] Port the stable Forge persona and rule sections from Forge source into `forge-system.md`
- [x] Split the prompt into clear sections:
  - [x] persona and mission
  - [x] core principles
  - [x] task management expectations
  - [x] tool selection philosophy
  - [x] output and communication rules
- [ ] Preserve Forge-important behavior such as:
  - [x] verify codebase facts with tools
  - [x] continue until the task is actually complete
  - [ ] strong todo discipline
  - [x] concise and professional responses
- [x] Add a prompt builder helper that can combine the base prompt with dynamic sections cleanly
- [x] Wire the package to use this base prompt as the primary system prompt source

### Description

This phase establishes the identity of the harness. The package should stop feeling like “Pi with a few custom tools” and instead feel like “Forge behavior running on Pi's runtime.”

### Expected output of Phase 2

- package-local Forge prompt exists
- the base prompt is loaded deterministically
- the runtime has a single helper that composes the final Forge prompt body

### Test checkpoint

- [x] base prompt loads from package-local asset
- [x] prompt builder outputs a non-empty Forge prompt
- [x] no dependency remains on unrelated top-level prompt files

### Safe rollback boundary

- revert only prompt assets and prompt wiring without affecting future tool or workflow modules

---

## Phase 3 — Dynamic per-turn context injection

### Goal

Append Forge-style runtime sections to the base prompt on each turn so the model sees fresh tool, skill, environment, and project context.

### Files to add

- `extensions/forge-content/prompt/runtime-context.ts`
- `extensions/forge-content/prompt/project-guidelines.ts`

### Files to touch

- `extensions/forge-content/index.ts`
- `extensions/forge-content/prompt/build-system-prompt.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- `packages/coding-agent/src/core/resource-loader.ts`

### Tasks

- [x] Add a `before_agent_start` hook that appends dynamic prompt blocks to the base Forge prompt
- [x] Inject a structured system-information block containing:
  - [x] current working directory
  - [x] shell
  - [x] home directory
  - [x] current date
  - [x] active mode or profile
- [ ] Inject a project-guidelines block derived from context files already loaded by Pi
- [x] Inject active-tool-specific guidance based on the currently enabled tool set
- [ ] Inject available-skill guidance while preserving Pi-native skill behavior
- [x] Keep the injection order deterministic so multiple prompt contributors do not stomp each other

### Description

Forge's prompt is not purely static. This phase reproduces the dynamic wrapper behavior in Pi using `before_agent_start`, while keeping the final prompt composition understandable and testable.

### Expected output of Phase 3

- each turn sees fresh dynamic context sections
- project and runtime information are visible in the prompt
- mode changes can alter prompt behavior without replacing the whole base prompt

### Test checkpoint

- [x] dynamic sections appear in the final effective system prompt
- [ ] project-guideline text is included when context files exist
- [x] active-tool guidance changes when active tools change

### Safe rollback boundary

- dynamic prompt injection can be reverted while keeping the static Forge base prompt

---

## Phase 4 — Bundled resource discovery for skills and prompt templates

### Goal

Make the package self-contained by exposing bundled skills and workflow prompts through Pi's native resource-discovery path.

### Files to add

- `extensions/forge-content/resources/discover.ts`
- `extensions/forge-content/resources/skills/forge-research/SKILL.md`
- `extensions/forge-content/resources/skills/forge-review/SKILL.md`
- `extensions/forge-content/resources/prompts/implement.md`
- `extensions/forge-content/resources/prompts/scout-and-plan.md`
- `extensions/forge-content/resources/prompts/review.md`
- `extensions/forge-content/agents/forge.md`
- `extensions/forge-content/agents/sage.md`
- `extensions/forge-content/agents/muse.md`

### Files to touch

- `extensions/forge-content/index.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- `packages/coding-agent/src/core/skills.ts`
- `packages/coding-agent/src/core/prompt-templates.ts`

### Tasks

- [x] Implement `resources_discover` so the extension contributes bundled skills
- [x] Implement `resources_discover` so the extension contributes bundled prompt templates
- [x] Add a minimal skill set for research and review workflows
- [x] Add prompt templates that mirror Forge-style common workflows
- [x] Add mode metadata or prompt assets for Forge-like presets such as `forge`, `sage`, and `muse`
- [x] Verify resource paths resolve correctly when the extension is loaded from the project repo

### Description

Pi already knows how to load and inject skills and prompt templates. This phase uses that machinery instead of inventing a parallel skill/prompt loader inside the extension.

### Expected output of Phase 4

- bundled skills are discoverable and visible to the runtime
- bundled workflow prompts are invokable through Pi prompt commands
- mode assets are colocated with the package instead of scattered externally

### Test checkpoint

- [x] resource discovery returns the expected skill and prompt paths
- [ ] skills load successfully and surface in prompt context
- [ ] prompt templates expand from bundled package assets

### Safe rollback boundary

- remove bundled resources without changing prompt or tool runtime code

---

## Phase 5 — Workflow state and todo tools

### Goal

Reproduce Forge's task-management workflow with first-class todo tools and visible progress state.

### Files to add

- `extensions/forge-content/workflow/todo-state.ts`
- `extensions/forge-content/workflow/todo-tools.ts`
- `extensions/forge-content/workflow/todo-widget.ts`
- `extensions/forge-content/workflow/index.ts`

### Files to touch

- `extensions/forge-content/index.ts`
- `packages/coding-agent/examples/extensions/todo.ts`
- `packages/coding-agent/examples/extensions/plan-mode/index.ts`
- `crates/forge_domain/src/tools/descriptions/todo_write.md`
- `crates/forge_domain/src/tools/descriptions/todo_read.md`

### Tasks

- [x] Implement `todo_write` with Forge-like update semantics
- [x] Implement `todo_read` for reading the current session todo state
- [x] Store todo state in a branch-safe way so tree navigation behaves correctly
- [x] Add a persistent widget showing task progress
- [x] Add prompt guidance that strongly encourages `todo_write` usage for complex tasks
- [x] Keep renderer output compact so todos improve visibility instead of creating transcript noise

### Description

This is one of the most important behavioral differences between plain Pi and Forge. The package should visibly guide the agent toward structured task tracking and make that state easy for users to inspect.

### Expected output of Phase 5

- todo tools exist and are usable by the model
- todo state survives normal session flow and branch changes
- the UI shows a progress widget when todo state exists

### Test checkpoint

- [x] todo items can be added, updated, completed, and cancelled
- [x] reconstructed todo state matches the current branch
- [ ] widget output reflects todo state accurately

### Safe rollback boundary

- workflow state and todo tools can be removed without affecting the rest of the tool set

---

## Phase 6 — Core Forge tool surface

### Goal

Ship the first useful Forge-compatible tool set on top of Pi.

### Files to add

- `extensions/forge-content/tools/index.ts`
- `extensions/forge-content/tools/read.ts`
- `extensions/forge-content/tools/shell.ts`
- `extensions/forge-content/tools/fs-search.ts`
- `extensions/forge-content/tools/patch.ts`
- `extensions/forge-content/tools/followup.ts`
- `extensions/forge-content/tools/common.ts`

### Files to touch

- `extensions/forge-content/index.ts`
- `extensions/codex-content/compatibility-tools/read-file.ts`
- `extensions/codex-content/compatibility-tools/shell-command.ts`
- `extensions/codex-content/compatibility-tools/grep-files.ts`
- `extensions/codex-content/compatibility-tools/apply-patch.ts`
- `crates/forge_domain/src/tools/catalog.rs`
- `crates/forge_domain/src/tools/descriptions/fs_search.md`
- `crates/forge_domain/src/tools/descriptions/shell.md`
- `crates/forge_domain/src/tools/descriptions/fs_patch.md`

### Tasks

- [x] Decide which Pi built-ins to preserve directly and which Forge-style tools to wrap or override
- [x] Implement file reading support, either by keeping Pi `read` active or exposing a Forge-compatible wrapper that still preserves skill compatibility
- [x] Implement `shell` with Forge-style schema and guidance, delegating to Pi shell execution where appropriate
- [x] Implement `fs_search` with Forge-style regex, glob, path, and output-mode semantics
- [x] Implement `patch` with a Forge-compatible search/replace contract
- [x] Implement `followup` as a structured user-input tool for clarification and branching decisions
- [x] Register the first stable Forge tool set through a single tool registration module

### Description

This phase makes the package practically useful. The aim is not to port every Forge tool immediately, but to deliver the small set that drives most coding workflows.

### Expected output of Phase 6

- a first stable Forge tool surface exists
- users can explore, edit, patch, run shell commands, and ask follow-up questions
- the package is usable for normal software tasks even before advanced features ship

### Test checkpoint

- [x] tool registration succeeds and tools are callable
- [ ] `shell` delegates correctly and returns stable details
- [x] `fs_search` produces deterministic output structure
- [x] `patch` edits files safely according to the chosen contract
- [ ] `followup` returns structured answers compatible with renderer and workflow layers

### Safe rollback boundary

- tool modules can be reverted independently without affecting prompt composition or workflow state

---

## Phase 7 — Tool prompt hints and behavioral rules

### Goal

Encode Forge-like tool selection behavior through tool-level prompt metadata rather than overloading the top-level system prompt.

### Files to add

- `extensions/forge-content/tools/prompt-hints.ts`

### Files to touch

- `extensions/forge-content/tools/index.ts`
- `extensions/forge-content/tools/read.ts`
- `extensions/forge-content/tools/shell.ts`
- `extensions/forge-content/tools/fs-search.ts`
- `extensions/forge-content/tools/patch.ts`
- `extensions/forge-content/tools/followup.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### Tasks

- [x] Add rich tool `description` values for all Forge tools
- [x] Add concise `promptSnippet` values so the active tool set shows up meaningfully in the prompt
- [x] Add `promptGuidelines` for behavior such as:
  - [x] prefer `fs_search` over shell grep/find
  - [x] prefer `patch` over file rewrite for edits
  - [x] use `followup` when clarification is necessary
  - [x] use todo tools for non-trivial work
- [x] Ensure the package rebuilds prompt behavior correctly when active tools change
- [x] Keep tool-specific guidance small and high-signal

### Description

Pi already supports prompt-time tool hints. This phase makes the package behave more like Forge by encoding tool choice expectations where they naturally belong: on the tools themselves.

### Expected output of Phase 7

- the prompt surface reflects active Forge tools
- tool-specific behavioral guidance changes when mode or active tools change

### Test checkpoint

- [ ] active-tool snippets appear in the final effective prompt
- [ ] tool guideline bullets are deduplicated and injected once
- [ ] switching active tools changes the prompt hint surface deterministically

### Safe rollback boundary

- prompt hints can be removed without changing tool execution behavior

---

## Phase 8 — Forge-style tool rendering and UI polish

### Goal

Make the transcript and widgets feel intentionally Forge-like rather than generic Pi tool output.

### Files to add

- `extensions/forge-content/renderers/common.ts`
- `extensions/forge-content/renderers/read.ts`
- `extensions/forge-content/renderers/shell.ts`
- `extensions/forge-content/renderers/patch.ts`
- `extensions/forge-content/renderers/search.ts`
- `extensions/forge-content/renderers/todo.ts`

### Files to touch

- `extensions/forge-content/tools/read.ts`
- `extensions/forge-content/tools/shell.ts`
- `extensions/forge-content/tools/fs-search.ts`
- `extensions/forge-content/tools/patch.ts`
- `extensions/forge-content/workflow/todo-tools.ts`
- `packages/coding-agent/examples/extensions/built-in-tool-renderer.ts`
- `packages/coding-agent/examples/extensions/todo.ts`
- `packages/coding-agent/docs/tui.md`

### Tasks

- [x] Add compact `renderCall` output for each important Forge tool
- [x] Add rich `renderResult` output for expanded mode
- [x] Ensure tool `details` carry enough structured data for renderers to avoid brittle text parsing
- [x] Use a consistent visual language across Forge tools
- [x] Keep collapsed output short and expanded output useful
- [ ] Follow Pi TUI invalidation rules so theme changes and live updates work correctly

### Description

This phase is about harness feel. The package should look coherent in use, not like several unrelated tools with mismatched transcript styles.

### Expected output of Phase 8

- important tool calls and results render with a Forge-style transcript feel
- expanded views show useful details for shell output, diffs, and search results
- todo and status widgets feel integrated with the rest of the package

### Test checkpoint

- [ ] renderers handle both collapsed and expanded states
- [ ] live or partial updates do not break rendering
- [ ] theme invalidation rebuilds colored content correctly

### Safe rollback boundary

- rendering changes can be reverted while keeping tool behavior intact

---

## Phase 9 — Forge-like modes and presets

### Goal

Support multiple Forge-style operating modes such as implementation, research, and planning.

### Files to add

- `extensions/forge-content/agents/modes.ts`
- `extensions/forge-content/agents/commands.ts`
- `extensions/forge-content/agents/widget.ts`

### Files to touch

- `extensions/forge-content/index.ts`
- `extensions/forge-content/agents/forge.md`
- `extensions/forge-content/agents/sage.md`
- `extensions/forge-content/agents/muse.md`
- `crates/forge_repo/src/agents/forge.md`
- `crates/forge_repo/src/agents/sage.md`
- `crates/forge_repo/src/agents/muse.md`
- `packages/coding-agent/examples/extensions/plan-mode/index.ts`

### Tasks

- [x] Define mode presets for `forge`, `sage`, and `muse`
- [x] For each mode, define:
  - [x] active tools
  - [x] mode-specific prompt append
  - [x] UI label or status indicator
  - [x] read-only or planning restrictions where appropriate
- [x] Register slash commands to switch modes
- [x] Rebuild active tools on mode switch with `pi.setActiveTools()`
- [x] Inject mode-specific prompt sections during `before_agent_start`
- [x] Surface current mode in status or widget UI

### Description

This phase gives the package the same “different agent personalities with different tool affordances” feel that Forge ships through multiple agent definitions.

### Expected output of Phase 9

- users can switch between Forge-like implementation, research, and planning modes
- mode switching updates both prompt behavior and active tools
- the UI indicates the current operating mode clearly

### Test checkpoint

- [x] switching to each mode enables the correct active tools
- [ ] mode prompt append logic is applied exactly once
- [ ] read-only or planning restrictions are enforced where defined

### Safe rollback boundary

- mode switching can be removed while preserving the base Forge package behavior

---

## Phase 10 — Tests and example scenarios

### Goal

Protect the runtime contracts that matter without over-testing static content.

### Files to add

- `extensions/forge-content/prompt/build-system-prompt.test.ts`
- `extensions/forge-content/resources/discover.test.ts`
- `extensions/forge-content/workflow/todo-tools.test.ts`
- `extensions/forge-content/tools/fs-search.test.ts`
- `extensions/forge-content/tools/patch.test.ts`
- `extensions/forge-content/agents/modes.test.ts`

### Files to touch

- `AGENTS.md`
- `extensions/codex-content/compatibility-tools/runtime.test.ts`
- `extensions/codex-content/compatibility-tools/search-tools.test.ts`

### Tasks

- [x] Add prompt-assembly tests that verify contract-level behavior, not giant snapshots
- [x] Add todo-state tests for creation, update, completion, cancellation, and branch reconstruction
- [x] Add core tool tests for schema normalization and execution contracts
- [ ] Add mode-switching tests that verify active tools and prompt changes
- [x] Add resource-discovery tests for bundled skills and prompts
- [ ] Add a small number of renderer-contract tests only where breakage would hurt users materially

### Description

This phase keeps the package maintainable. Tests should focus on user-visible runtime behavior and integration boundaries, consistent with the repository's testing guidance.

### Expected output of Phase 10

- the package has focused high-value coverage around prompt assembly, workflow state, tool contracts, and mode switching
- future refactors can move faster without silently breaking the harness behavior

### Test checkpoint

- [x] tests pass for prompt, workflow, tools, and modes
- [x] no large low-signal snapshots are required to keep confidence high

### Safe rollback boundary

- tests can be refined independently after implementation without changing runtime behavior

---

## Deferred work after V1

These are intentionally out of the first implementation slice unless earlier phases end up much smaller than expected.

- [ ] `fetch` tool for remote web/content retrieval
- [ ] `skill` explicit loader tool for stronger Forge parity
- [ ] semantic code search backend and `sem_search`
- [ ] subagent workflows for true `sage`-style delegation
- [ ] MCP-style external tool bridging if needed later

---

## Recommended implementation order

1. package skeleton
2. base Forge prompt
3. dynamic context injection
4. bundled resource discovery
5. todo workflow
6. core Forge tools
7. prompt hints
8. renderers
9. modes
10. tests

The reason for this order is simple:

- the package should feel coherent early, even before all tools exist
- workflow and prompt behavior shape the rest of the package
- renderers and modes are much easier to build once the underlying tool contracts are stable

---

## Definition of done

- a single package under `extensions/forge-content/` provides a usable Forge-style harness inside Pi
- the system prompt is package-local, deterministic, and layered with dynamic runtime context
- bundled skills and prompts are discovered through Pi-native mechanisms
- todo tools and progress UI make long-running work visible
- the first stable Forge tool set is available and rendered coherently
- users can switch between at least three Forge-like modes
- tests protect the important runtime contracts
