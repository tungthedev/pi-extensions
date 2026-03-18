# Handoff Prompt: Extension Refactor Implementation Agent

You are taking over implementation work in this repo:

- Repo: `/Volumes/Data/Projects/exp/pi-extensions`

Your job is to execute the extension refactor plan in a safe, incremental way.

## Read first

Before making changes, read these files fully:

- `docs/plans/2026-03-17-extension-refactor-plan.md`
- `README.md`
- `package.json`

Then inspect the current implementation files:

- `extensions/codex-content/index.ts`
- `extensions/codex-content/codex-tools.ts`
- `extensions/codex-content/workflow-tools.ts`
- `extensions/codex-content/subagents.ts`
- `extensions/codex-content/apply-patch.ts`
- `extensions/codex-content/image-utils.ts`
- `extensions/ext-manager/index.ts`
- `extensions/ext-manager/local.ts`
- `extensions/ext-manager/packages.ts`
- `extensions/ext-manager/ui.ts`
- `extensions/ext-manager/types.ts`

## Context

This repo contains two Pi extensions:

1. `extensions/codex-content/`
   - Codex-style compatibility tools and tool UX
   - workflow tools (`update_plan`, `request_user_input`)
   - subagent tools
   - patch/image helpers

2. `extensions/ext-manager/`
   - interactive extension manager UI
   - local extension discovery/toggling
   - package extension discovery/filtering/settings updates

There is already a concrete refactor plan on disk. Follow it rather than inventing a new structure unless you discover a strong reason to deviate.

## Important known issues

Prior review identified these near-term issues:

1. `extensions/codex-content/codex-tools.ts`
   - `shell_command` is brittle with non-POSIX shells because it assumes `-c` / `-lc` behavior based on `$SHELL`
   - `list_dir` output does not fully match its documented contract

2. `extensions/ext-manager/local.ts`
   - configured-local discovery may treat missing configured files as valid entries

3. `extensions/ext-manager/index.ts` / `extensions/ext-manager/ui.ts`
   - avoid depending on `ctx.ui` when `ctx.hasUI === false`
   - async UI actions should be guarded so failures do not become unhandled promise rejections

4. Test coverage is currently thin outside `extensions/codex-content/apply-patch.test.ts`

Also note: shell commands in this environment may fail if they rely on the host shell behaving like Bash. Prefer repo file inspection tools, and when running commands, be deliberate and minimal.

## Goal

Implement the refactor incrementally while preserving public behavior.

Public interfaces to preserve unless explicitly required for a bug fix:

- package name and package manifest shape
- extension entrypoints
- command `/extmgr`
- shortcut `ctrl+shift+e`
- Codex-compatible tool names:
  - `read_file`
  - `list_dir`
  - `grep_files`
  - `shell_command`
  - `apply_patch`
  - `view_image`
- workflow tool names:
  - `update_plan`
  - `request_user_input`
- subagent tool names:
  - `spawn_agent`
  - `resume_agent`
  - `send_input`
  - `wait_agent`
  - `close_agent`

## Execution strategy

Work in small phases. Do not try to rewrite everything in one pass.

### Phase A: establish safety

First, add or improve tests around the highest-risk existing logic before large moves.

Priority test targets:

- `extensions/ext-manager/packages.ts`
- `extensions/ext-manager/local.ts`
- `extensions/codex-content/codex-tools.ts`
- pure or mostly pure helpers inside `extensions/codex-content/subagents.ts`

Focus especially on:

- package filter behavior
- package settings updates
- local extension discovery
- missing configured file behavior
- `read_file` indentation mode
- `list_dir` output
- shell invocation selection logic

### Phase B: land targeted bug fixes

Before major file splits, fix the known issues listed above.

Keep these fixes narrowly scoped and covered by tests.

### Phase C: do structural splits

Follow the target layout in:

- `docs/plans/2026-03-17-extension-refactor-plan.md`

Recommended order:

1. split `extensions/ext-manager/` first
2. split `extensions/codex-content/` except subagents
3. split `extensions/codex-content/subagents.ts` last

## Expectations while coding

- keep `index.ts` files thin and declarative
- extract helpers instead of copying logic
- preserve behavior while moving code
- avoid hidden runtime coupling through module-level `process.cwd()` when context can be used instead
- prefer typed service/helper modules over giant files with mixed responsibilities
- if you change behavior, document why in the final summary

## Practical constraints

- Use Bun/TypeScript conventions already present in the repo.
- Keep formatting and style aligned with the existing codebase.
- Do not introduce unnecessary dependencies.
- Do not redesign the UX unless needed for correctness or maintainability.
- Avoid broad renames without clear value.

## Deliverables

For each batch of work:

1. implement the code changes
2. update or add tests
3. run the narrowest relevant checks you can
4. summarize:
   - what changed
   - what remains
   - any risks or follow-ups

## Preferred first task

Start with:

1. read the refactor plan
2. add tests for ext-manager local/package logic and codex compatibility tool helpers
3. fix the small correctness issues:
   - shell portability
   - `list_dir` contract alignment
   - missing configured file handling
   - non-UI safety / async action guarding

Only after that should you begin module extraction.

## Acceptance criteria

The work is on track if:

- tests cover the newly stabilized behavior
- ext-manager starts becoming modular without changing the command UX
- codex-content splits into smaller responsibility-focused modules
- subagents are left for last unless you only extract pure helpers first
- the public tool and command surface remains intact

## Final instruction

Do not start with a full rewrite. Start with the smallest safe step that improves correctness and testability, then proceed incrementally according to the plan.
