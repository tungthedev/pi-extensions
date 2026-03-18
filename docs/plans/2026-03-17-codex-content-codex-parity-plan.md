# Codex Content → Codex Harness Parity Plan

Date: 2026-03-17

## Goal

Bring `extensions/codex-content/` materially closer to the OpenAI Codex CLI harness in four areas:

- tool surface
- tool contracts and behavior
- system prompt / agent behavior
- TUI rendering and interaction patterns

This is a planning artifact only. It does not start implementation by itself.

---

## Desired outcome

After this work, `codex-content` should feel like a Codex-compatible Pi package rather than a Pi extension with Codex-flavored names.

Specifically:

- the active tool set should match the important Codex tools closely enough that prompt behavior transfers cleanly
- tool parameter schemas and outputs should be compatible where practical
- the system prompt should encode Codex behavior directly from packaged assets
- the TUI should present exploration, shell, patch, plan, user-input, and subagent actions in a recognizably Codex-like way

---

## Current state summary

### Already present

- Codex-style compatibility tools:
  - `read_file`
  - `list_dir`
  - `grep_files`
  - `shell_command`
  - `apply_patch`
  - `view_image`
- workflow tools:
  - `update_plan`
  - `request_user_input`
- subagent tools:
  - `spawn_agent`
  - `resume_agent`
  - `send_input`
  - `wait_agent`
  - `close_agent`
- some Codex-style compact renderers for Pi-native `bash`, `edit`, `write`

### Main parity gaps

- prompt injection currently depends on an external `system-prompt.md` that is not packaged here
- exploration UI tracks Pi-native `read|grep|find|ls`, while the active Codex tools are `read_file|grep_files|list_dir`
- `apply_patch` is exposed as a JSON object with `input`, not as Codex-style freeform grammar
- `request_user_input` behavior and schema differ substantially from Codex
- subagent tool schemas differ substantially from Codex
- Codex tools like `request_permissions`, `tool_search`, and `tool_suggest` are missing
- TUI rendering is mostly compact Pi text blocks, not Codex transcript-style history cells
- `view_image` lacks Codex's `detail: original` behavior

---

## Principles

1. Preserve package entrypoints and overall package install shape.
2. Prefer exact Codex contracts where Pi can support them cleanly.
3. Keep backward compatibility only when it does not undermine Codex parity.
4. Prioritize behavior and transcript fidelity over superficial naming.
5. Add tests before or together with each high-risk behavior change.
6. Land work in small phases so the package remains usable throughout.

---

## Non-goals for the first pass

- full reproduction of every Codex internal feature
- exact reimplementation of the Rust TUI architecture inside Pi
- low-value long-tail features before core parity is solid
- broad refactors unrelated to Codex parity

---

## Phase 0 — Lock scope and assets

### Deliverables

- a final parity target list
- a packaged Codex prompt asset strategy
- explicit priority order for implementation

### Checklist

- [ ] Decide which Codex surface is in scope for v1 parity:
  - [ ] core local coding tools
  - [ ] workflow tools
  - [ ] subagents
  - [ ] approvals
  - [ ] discovery tools
  - [ ] optional extras like web search / JS repl / artifacts
- [x] Choose the source prompt asset to mirror:
  - [x] `codex-rs/core/prompt.md`
  - [ ] `codex-rs/core/prompt_with_apply_patch_instructions.md`
  - [ ] model-specific variants only if needed later
- [x] Package the selected prompt text inside `extensions/codex-content/`
- [x] Stop relying on an external repo-local `system-prompt.md`
- [ ] Document what must be exact parity vs. what can be Pi-adapted

---

## Phase 1 — Prompt and behavioral parity

### Goal

Make the agent behave like Codex before polishing UI.

### Checklist

- [x] Add a packaged prompt asset file under `extensions/codex-content/`
- [x] Update `extensions/codex-content/prompt.ts` to load packaged prompt text
- [x] Ensure prompt injection is deterministic and does not silently no-op
- [ ] Mirror key Codex instructions around:
  - [ ] preamble messages before tool calls
  - [ ] using `update_plan`
  - [ ] continuing until task completion
  - [ ] preferring `apply_patch`
  - [ ] using `shell_command` with `workdir`
  - [ ] concise final responses
- [x] Add prompt-level guidance for Codex-compatible tools via `promptSnippet` / `promptGuidelines` where useful
- [x] Test prompt extraction / injection behavior

### Acceptance criteria

- [x] `codex-content` always injects Codex-style instructions from package-local assets
- [x] no dependency remains on a missing top-level `system-prompt.md`

---

## Phase 2 — Core tool contract parity

### Goal

Make the important Codex tools match Codex schemas and semantics closely.

### Priority A: exact-match tools

- [ ] `read_file`
  - [ ] verify parameter names and descriptions
  - [ ] verify line numbering behavior
  - [ ] verify indentation-mode behavior
  - [ ] verify truncation behavior is reasonable
- [ ] `list_dir`
  - [ ] verify numbering, type labels, continuation guidance
  - [ ] verify depth and offset semantics
- [ ] `grep_files`
  - [ ] verify regex/glob/path semantics
  - [ ] verify sort order and truncation behavior
- [ ] `shell_command`
  - [ ] verify `workdir`, `timeout_ms`, `login`
  - [ ] verify shell portability behavior
  - [ ] verify output formatting against Codex expectations
- [ ] `view_image`
  - [x] add `detail` support when feasible
  - [x] support Codex-style default vs `original`

### Priority B: behaviorally important mismatches

- [ ] `apply_patch`
  - [ ] change from JSON-only wrapper to Codex-style freeform input if Pi allows it cleanly
  - [ ] keep compatibility fallback only if needed
  - [ ] align error behavior and messaging
- [x] `request_user_input`
  - [x] align with Codex's structured questions schema
  - [ ] support 1–3 questions
  - [ ] require option-driven answers like Codex where appropriate
  - [x] preserve Pi-specific fallback behavior only when necessary

### Tests

- [ ] add schema-level tests for all compatibility tools
- [ ] add behavior tests for `read_file`, `list_dir`, `grep_files`, `shell_command`, `apply_patch`, `view_image`
- [ ] add explicit regression tests for any intentional deviations

### Acceptance criteria

- [ ] main compatibility tools can be used with Codex-like prompts without tool-contract confusion

---

## Phase 3 — Subagent parity

### Goal

Bring subagent APIs and transcript behavior closer to Codex.

### Checklist

- [x] compare current Pi subagent API with Codex fields:
  - [x] `spawn_agent`
  - [x] `send_input`
  - [x] `resume_agent`
  - [x] `wait_agent`
  - [x] `close_agent`
- [ ] decide compatibility strategy:
  - [ ] strict Codex schema only
  - [x] dual-schema transition layer
  - [x] preserve old aliases short-term
- [ ] support Codex-style fields where feasible:
  - [x] `message`
  - [x] `items`
  - [x] `id`
  - [x] `ids`
  - [x] `agent_type`
  - [x] `fork_context`
  - [x] `reasoning_effort` if supported by Pi
- [x] align result payload shapes more closely with Codex
- [ ] tighten subagent usage guidance in tool descriptions / prompt guidance
- [x] add tests for schema translation and durable state behavior

### Acceptance criteria

- [ ] agent delegation prompts written for Codex mostly transfer without rewrite

---

## Phase 4 — Missing tool gaps

### Goal

Fill the most important missing Codex tools after the core tools are aligned.

### Checklist

- [ ] add `request_permissions` equivalent if Pi can support it meaningfully
- [ ] decide whether to add `tool_search`
- [ ] decide whether to add `tool_suggest`
- [ ] decide whether to add optional parity tools later:
  - [ ] web search
  - [ ] JS repl
  - [ ] code mode
  - [ ] artifacts
  - [ ] csv agent jobs

### Priority rule

- [ ] do not add long-tail tools before prompt + core tool + subagent parity is solid

---

## Phase 5 — TUI parity: core transcript patterns

### Goal

Make the interaction feel like Codex in practice.

### Checklist

- [ ] replace purely minimal tool result blocks with richer Codex-style renderers for:
  - [x] `shell_command`
  - [x] `apply_patch`
  - [x] `read_file`
  - [x] `list_dir`
  - [x] `grep_files`
  - [x] `request_user_input`
  - [ ] subagent tool events
- [x] make exploration rendering track the actual active compatibility tools:
  - [x] `read_file`
  - [x] `grep_files`
  - [x] `list_dir`
  - [ ] optionally `find` parity if introduced
- [x] render shell calls more like Codex:
  - [x] running state
  - [x] concise command title
  - [x] compact output preview
  - [x] better expanded output behavior
- [ ] render `apply_patch` more like Codex:
  - [x] file summary in collapsed view
  - [x] diff-oriented expanded view
  - [x] clearer failure rendering
- [ ] improve `update_plan` rendering toward Codex-style todo list semantics
- [x] improve `request_user_input` rendering toward Codex-style question/answer transcript rows
- [ ] improve subagent rendering toward Codex-style spawn / waiting / sent-input / close summaries

### Stretch goals

- [ ] explore whether Pi custom TUI components can emulate Codex transcript cells more closely
- [ ] explore whether status segments / widgets can reproduce Codex bottom-pane cues better

### Acceptance criteria

- [ ] a user looking at the TUI can recognize Codex-like execution flow without inspecting implementation details

---

## Phase 6 — Wiring cleanup and consistency

### Goal

Remove mismatches between active tools, prompt guidance, and render/event wiring.

### Checklist

- [ ] audit `pi.setActiveTools()` usage
- [x] ensure the active tool names match the tools the UI trackers expect
- [ ] decide whether Pi-native wrappers (`read`, `grep`, `find`, `ls`, `bash`, `edit`, `write`) should remain enabled internally
- [ ] either:
  - [x] migrate exploration/event handling to compatibility tool names
  - [ ] or re-expose Codex names through wrappers that share render/event logic
- [ ] ensure tool descriptions, prompt snippets, and behavior all agree
- [ ] remove dead compatibility layers that no longer serve parity

### Acceptance criteria

- [ ] there is one coherent Codex-facing surface, not two partially overlapping ones

---

## Phase 7 — Validation and documentation

### Checklist

- [ ] add / update tests for every changed contract
- [ ] run narrow tests after each phase
- [ ] run package-level checks before finishing:
  - [ ] `bun run test`
  - [ ] `bun run lint`
  - [ ] `bun run typecheck`
- [ ] update `README.md` with supported Codex-parity scope
- [ ] document any intentional differences that remain
- [ ] add a follow-up list for deferred parity items

---

## Recommended implementation order

1. Phase 1 — prompt parity
2. Phase 2 — core tool contracts
3. Phase 6 — wiring consistency fix for active tools vs exploration UI
4. Phase 3 — subagent parity
5. Phase 5 — TUI parity for high-value transcript flows
6. Phase 4 — missing tools
7. Phase 7 — validation and docs polish

---

## Decision log to fill during implementation

- [ ] Decide whether `apply_patch` becomes freeform-only or dual-mode
- [x] Decide whether to preserve current Pi-style `request_user_input` as alias behavior
- [x] Decide whether to preserve current `agent_id` field names alongside Codex `id` / `ids`
- [x] Decide whether `request_permissions` is feasible in Pi without misleading behavior
- [x] Decide whether missing optional tools are in-scope for this package version

---

## Definition of done

- [x] packaged prompt parity is in place
- [ ] core Codex tools have close contract parity
- [ ] subagent tools have close contract parity
- [ ] exploration and transcript rendering follow the active Codex tool surface
- [ ] the most obvious Codex-vs-Pi behavioral mismatches are removed
- [ ] tests cover the changed contracts and behaviors
- [ ] remaining differences are documented explicitly
