# Codex Content Readability Cleanup Plan

Date: 2026-03-19

## Goal

Make `extensions/codex-content/` extremely easy to consume.

Primary goals:

- make files easy to skim
- reduce cleverness
- prefer early returns over nested branching
- move repeated logic into shared utility files
- split mixed-responsibility files into smaller units

This is a planning artifact only. It does not start implementation by itself.

---

## Review frame

This plan is based on a static review of `extensions/codex-content/` with emphasis on readability, skimmability, structure, and repeated logic.

Priority levels:

- `P0`: highest-value readability work; biggest sources of confusion
- `P1`: important cleanup that meaningfully improves comprehension
- `P2`: useful cleanup and deduplication work
- `P3`: low-risk polish, naming, or structural cleanup

Each file entry lists:

- `Problem`: what makes the file harder to read or maintain
- `Fix needed`: the concrete cleanup to make the file clearer

---

## P0

### `extensions/codex-content/patch/apply.ts`

Problem:

- this is the hardest file in the package to skim
- it mixes patch validation, diff generation, fuzzy matching, virtual file state, filesystem commit and rollback, and result summary formatting
- the top-level `applyPatch()` loop dispatches inline across too many responsibilities

Fix needed:

- split the file by responsibility or extract large top-level helpers
- move redaction checks into a dedicated validation helper
- move virtual file load and commit logic into a small `virtual-fs` helper module
- move diff text builders into a dedicated diff helper
- move update-chunk application into a focused helper such as `applyUpdateHunk()`
- make `applyPatch()` read as a short dispatcher with one branch per hunk type and early returns or handler calls

### `extensions/codex-content/exploration/state.ts`

Problem:

- the file is acting as formatter, summary builder, event translator, deduper, state tracker, and lifecycle store all at once
- nested ternaries and compact control flow make core paths slower to read
- `summarizeExplorationItems()` is cleverer than it needs to be
- there is leftover cleanup noise like `void firstLine`

Fix needed:

- split formatting helpers from tracker state logic
- move target formatting and summary formatting into separate small helpers or files
- replace nested ternaries with `switch` statements or ordered helper functions
- simplify read-item merge logic so it does not fabricate temporary item shapes
- remove dead suppression leftovers and keep only purposeful code paths

### `extensions/codex-content/compatibility-tools/read-file.ts`

Problem:

- the tool `execute()` path handles path resolution, stat lookup, secret blocking, image redirect, size validation, mode selection, file reading, and result shaping in one large block
- `readIndentationBlock()` is dense and not easy to reason about quickly
- `readSliceFromFile()` contains duplicated limit checks and more state than needed

Fix needed:

- extract helpers like `statOrThrow`, `buildSecretBlockedResult`, `buildImageRedirectResult`, `validateModeLimits`, `readSliceMode`, `readIndentationMode`, and `buildReadResult`
- simplify `readSliceFromFile()` to one clear loop with one limit check
- break `readIndentationBlock()` into named steps such as effective-indent calculation, selection expansion, and output rendering
- keep `execute()` as a short sequence of early-return guards followed by one mode dispatch

### `extensions/codex-content/compatibility-tools/runtime.ts`

Problem:

- this file mixes unrelated concerns: path normalization, shell detection, output trimming, process execution, capture buffering, and a UI helper
- the windowed capture logic is non-obvious and sits beside unrelated helpers
- the file is too large to serve as a pleasant shared utility surface

Fix needed:

- split into smaller modules such as `path-utils.ts`, `shell-utils.ts`, `process-utils.ts`, and `output-utils.ts`
- move `conciseResult()` into a renderer helper file
- add short comments around the non-obvious unicode path fallback and truncated stream capture strategy
- keep each utility module tightly scoped so readers know where to look for one kind of logic

### `extensions/codex-content/workflow/request-user-input.ts`

Problem:

- the main `execute()` path mixes schema normalization, legacy compatibility, UI branching, typed input collection, answer encoding, interruption handling, and result shaping
- repeated answer object construction makes the file noisy
- the question-building ternary chain is harder to skim than explicit helpers

Fix needed:

- extract `buildQuestionsFromParams`, `collectTypedAnswer`, `collectSelectedAnswer`, `buildCancelledAnswer`, and `buildRequestUserInputResult`
- move repeated answer object literals into dedicated helper builders
- replace the nested legacy-question setup with a clear function that returns normalized questions
- structure the main loop as a small set of early returns and helper calls

### `extensions/codex-content/images/resize.ts`

Problem:

- `resizeImage()` contains too much inline behavior: decode, orientation correction, size decisions, candidate encoding, retry loops, fallback behavior, and result building
- there is a nested local helper and several repeated return objects
- the happy path is harder to see than it should be

Fix needed:

- split the flow into named helpers: decode and orient, compute target bounds, encode candidate formats, retry by quality, retry by scale, and build fallback results
- move the nested `tryBothFormats()` helper to top level
- centralize repeated `ResizeImageResult` object creation in small helper builders
- make the main function read as a step-by-step pipeline

### `extensions/codex-content/workflow/plan.ts`

Problem:

- this file mixes plan normalization, status/icon mapping, widget rendering, UI sync, and tool registration
- `planFocusIndex()` and `planWidgetLines()` rely on nested conditional expressions instead of obvious ordered rules
- local helper duplication exists for shortening and concise rendering

Fix needed:

- split normalization helpers, rendering helpers, UI sync helpers, and tool registration into smaller units
- replace nested condition chains with ordered helper functions like `firstPlanItemByStatus()`
- move generic shorten helpers into `shared/text.ts`
- move generic concise render helpers into `renderers/common.ts`

### `extensions/codex-content/renderers/apply-patch.ts`

Problem:

- the renderer contains too many branches and repeated summary-building logic for what should be a compact display module
- there are separate but similar helper pairs for action title and action code
- failure rendering and success rendering are mixed into one large function

Fix needed:

- replace duplicated action helpers with one lookup map
- split into `renderFailedPatchResult`, `renderSingleFilePatchResult`, and `renderMultiFilePatchResult`
- move shared path summary helpers into `shared/text.ts` or `renderers/common.ts`
- keep the main renderer function as a small dispatcher

---

## P1

### `extensions/codex-content/compatibility-tools/find-files.ts`

Problem:

- it duplicates file-stat and mtime-sort logic that also exists in `grep-files.ts`
- the `execute()` function mixes parameter normalization, search execution, validation, and formatting

Fix needed:

- extract the shared stat-filter-sort behavior into a utility used by both find and grep tools
- extract ripgrep output normalization into a shared helper
- keep `execute()` as a short sequence: normalize params, find matches, validate offset, format result

### `extensions/codex-content/compatibility-tools/grep-files.ts`

Problem:

- it duplicates file-stat filtering and sort logic from `find-files.ts`
- `execute()` contains inline abort handling, error normalization, and output formatting
- the ripgrep argument setup is long and a bit noisy

Fix needed:

- share the stat-and-sort utility with `find-files.ts`
- extract `buildRgArgs()` and keep the `args` array construction out of the main search function
- extract abort result shaping into a small helper
- keep the main `execute()` logic linear and early-return oriented

### `extensions/codex-content/compatibility-tools/shell-command.ts`

Problem:

- the tool does command normalization, workdir validation, shell invocation setup, command execution, and transcript formatting inline
- several result objects are repeated with only small differences

Fix needed:

- extract `normalizeShellInput`, `validateWorkdir`, `buildShellErrorResult`, and `formatShellOutput`
- keep the error paths as early returns
- centralize repeated error response shape construction

### `extensions/codex-content/exploration/events.ts`

Problem:

- the file interleaves timer management, tracker reset logic, UI syncing, and event registration closures
- similar reset handlers are repeated across session and agent lifecycle events

Fix needed:

- extract timer helpers and reset/finalize helpers into small named functions
- collapse repeated event wiring into shared handlers where possible
- make the file read like a lifecycle table rather than a long list of closures

### `extensions/codex-content/exploration/ui.ts`

Problem:

- there are several thin wrapper functions that mostly forward to other helpers
- legacy widget cleanup logic is spread around and makes the file feel historical
- `clearLiveExplorationUI()` has an unused parameter pattern

Fix needed:

- collapse wrapper functions that add no meaning
- centralize legacy widget clearing into one helper
- remove unused parameters and compatibility leftovers where they no longer add value

### `extensions/codex-content/images/photon.ts`

Problem:

- the module monkey-patches `fs.readFileSync`, which is surprising and hard to trust at a glance
- the fallback logic is correct-looking but not obvious without careful reading

Fix needed:

- isolate the monkey-patch behind a clearly named helper like `installPhotonWasmFallback()`
- add a short comment explaining why the patch exists and when it is restored
- keep `loadPhoton()` as a short and linear loader flow

### `extensions/codex-content/patch/parser.ts`

Problem:

- `parseOneHunk()` handles all hunk types and update-path special cases in one function
- the heredoc unwrapping regex is compact and not self-explanatory

Fix needed:

- split `parseOneHunk()` into `parseAddHunk`, `parseDeleteHunk`, and `parseUpdateHunk`
- add a comment above `unwrapPatchInput()` to explain the accepted wrapper forms
- keep `parsePatch()` as a thin loop over hunk parsing

### `extensions/codex-content/renderers/request-user-input.ts`

Problem:

- it reimplements local shorten and answer-summary helpers that belong in shared utilities
- hidden-line counting compares two rendered arrays, which is clever but not very transparent

Fix needed:

- move shorten helpers and generic answer extraction helpers into shared utilities
- replace the render-and-diff hidden-count approach with a direct hidden-line rule
- keep rendering logic focused on presentation rather than answer parsing

### `extensions/codex-content/renderers/bash.ts`

Problem:

- the title/state computation uses nested conditional expressions
- body-line selection and hidden-count logic are embedded inline

Fix needed:

- replace title selection with a `switch` or simple lookup helper
- extract body-line selection into a small helper
- keep the renderer as a short read of title, body preview, and expand hint

### `extensions/codex-content/renderers/edit.ts`

Problem:

- it duplicates a compact single-file result-rendering pattern that also exists in `write.ts`

Fix needed:

- share the common path and suffix rendering logic with `write.ts`
- keep this file focused on edit-specific diff preview behavior only

### `extensions/codex-content/renderers/write.ts`

Problem:

- it duplicates the same general title and suffix structure as `edit.ts`

Fix needed:

- extract a small shared single-file result renderer helper used by both `edit.ts` and `write.ts`
- keep this file focused on write-specific details only

### `extensions/codex-content/patch/matching.ts`

Problem:

- the comparator list is implicit and the fuzzy matching strategy is not documented

Fix needed:

- define a named `MATCH_STRATEGIES` constant
- add a short comment explaining why progressively looser matching is allowed
- preserve the current behavior but make the strategy explicit

---

## P2

### `extensions/codex-content/shared/text.ts`

Problem:

- this should be the obvious home for shared shortening and summary helpers, but several modules still keep their own local versions

Fix needed:

- add reusable helpers for shortening inline text, shortening longer summaries, and maybe summarizing labeled answers
- use this file as the single shared home for generic string helpers used across workflow and renderer files

### `extensions/codex-content/renderers/common.ts`

Problem:

- common renderer helpers exist, but some generic renderer utilities still live elsewhere or are duplicated

Fix needed:

- move `conciseResult()` here from tool/runtime-specific files
- consider adding one or two shared compact-render helpers so renderers stay small
- keep this file the central renderer utility surface

### `extensions/codex-content/compatibility-tools/index.ts`

Problem:

- the file repeats session-start and before-agent-start logic through the same inner helper
- the disabling set name describes data but not intent

Fix needed:

- keep the shared apply-overrides helper but reduce duplicate event registration boilerplate if possible
- rename `DISABLED_BUILTIN_TOOL_NAMES` to something clearer like `REPLACED_BUILTIN_TOOL_NAMES`
- preserve behavior but make the intent easier to scan

### `extensions/codex-content/compatibility-tools/list-dir.ts`

Problem:

- there is inline entry mapping and a nested ternary for `typeLabel`
- output note formatting is repeated for skipped directories
- `execute()` still does more than one level of work at once

Fix needed:

- extract entry creation into a small helper like `buildDirectoryEntry()`
- replace the nested ternary with explicit conditional logic
- extract skipped-directory note formatting into one helper
- keep `execute()` as validate, scan, format, return

### `extensions/codex-content/compatibility-tools/view-image.ts`

Problem:

- it validates `detail` later than necessary and repeats some response-building shape inline

Fix needed:

- validate `detail` before file reads
- extract separate response builders for original and resized image results
- avoid repeated inline `buffer.toString("base64")` work where a small helper can improve readability

### `extensions/codex-content/compatibility-tools/apply-patch.ts`

Problem:

- success and error response shaping is repeated inline

Fix needed:

- extract shared helpers for success and failure result construction
- keep the tool body as `run patch`, `trim output`, `return mapped result`

### `extensions/codex-content/exploration/types.ts`

Problem:

- the tool-name union and tool-name set are maintained in parallel

Fix needed:

- define one `const` tuple of exploration tool names and derive both the union type and `Set` from it
- reduce the number of places that need updating when tool names change

### `extensions/codex-content/images/exif.ts`

Problem:

- byte-level parsing code is dense and full of magic numbers, which makes it harder to trust quickly

Fix needed:

- extract constants for JPEG, WebP, TIFF, and EXIF markers
- add a tiny helper layer for endian-aware reads and chunk checks
- keep the parsing behavior but make the code read less like raw byte math

### `extensions/codex-content/workflow/index.ts`

Problem:

- mutable workflow state is spread across local variables and the reset wiring is repeated

Fix needed:

- wrap explanation and plan state in one small state object
- extract a reusable reset helper and wire it to lifecycle events once
- keep the file as a small workflow bootstrapper

### `extensions/codex-content/workflow/types.ts`

Problem:

- schema constants and runtime types are mixed together in one file
- answer-object shape is inline inside a record type and harder to scan

Fix needed:

- extract a named `RequestAnswer` type
- consider separating schemas from domain types if the file grows further
- keep constants and types grouped by feature so readers can skim more easily

### `extensions/codex-content/shared/tool-results.ts`

Problem:

- the cast-heavy details merge is concise but not especially readable

Fix needed:

- add a small internal helper for safe details-object extraction
- make the Codex args contract explicit through naming and helper structure

### `extensions/codex-content/codex-tools.test.ts`

Problem:

- this file mixes tests for runtime helpers, path helpers, shell logic, read-file behavior, and grep behavior

Fix needed:

- split it into smaller files by module area
- keep each test file focused on one public module or one behavioral seam

### `extensions/codex-content/apply-patch.test.ts`

Problem:

- this test file is very large and mixes parser, matching, and apply behavior in one place

Fix needed:

- split into `patch/parser.test.ts`, `patch/matching.test.ts`, and `patch/apply.test.ts`
- extract shared temp-dir and patch-fixture helpers
- keep assertions focused on behavior, not long repeated message text where shorter contracts would do

### `extensions/codex-content/exploration/state.test.ts`

Problem:

- it only covers a narrow part of tracker behavior and will get harder to navigate if more cases are appended inline

Fix needed:

- split tests by concern if this suite grows
- add focused tests around summary formatting and dedupe behavior only if those are kept after refactor

### `extensions/codex-content/workflow/plan.test.ts`

Problem:

- the current test covers only one UI sync case and does not read like a good map of plan logic

Fix needed:

- add focused tests for plan normalization, focus selection, and collapsed visibility if those helpers remain public or testable
- keep the suite small but behavior-oriented

### `extensions/codex-content/shared/text.test.ts`

Problem:

- the suite is too small for a shared helper surface and only covers one narrow helper

Fix needed:

- either expand the shared helper coverage as helpers move here or remove low-value test noise if typecheck/build already protect the behavior well

### `extensions/codex-content/renderers/bash.test.ts`

Problem:

- the suite is minimal and may not be worth its own file in the current state

Fix needed:

- either expand it to cover meaningful renderer behavior or remove it if it does not protect a realistic regression

---

## P3

### `extensions/codex-content/index.ts`

Problem:

- the default export name is functional but not especially descriptive

Fix needed:

- consider renaming the default export to something explicit like `registerCodexContentExtension`
- keep the file as a thin wiring entrypoint only

### `extensions/codex-content/codex-tools.ts`

Problem:

- as a barrel, it is fine, but export ordering does not strongly signal grouping by area

Fix needed:

- reorder exports by domain so readers can scan the surface more easily
- keep the file aligned with the actual folder structure

### `extensions/codex-content/apply-patch.ts`

Problem:

- this barrel is fine, but export ordering can be clearer

Fix needed:

- align the order of value and type exports with `patch/index.ts`
- keep the barrel thin and predictable

### `extensions/codex-content/image-utils.ts`

Problem:

- this alias barrel adds one more indirection layer

Fix needed:

- keep it only if there is external API value in the alias
- otherwise collapse usage directly onto `images/index.ts`

### `extensions/codex-content/workflow-tools.ts`

Problem:

- this is a one-line barrel and may not earn its extra indirection

Fix needed:

- remove it if not needed for compatibility
- if it must remain, document that it is a compatibility alias only

### `extensions/codex-content/compatibility-tools/index.ts`

Problem:

- registration order is implicit and not documented

Fix needed:

- add a short comment or keep tool registration grouped in an obvious order: workflow first, then file tools, then shell/image tools

### `extensions/codex-content/exploration/events.ts`

Problem:

- comments are sparse around why some lifecycle resets happen at `agent_start` instead of lower-level turn boundaries

Fix needed:

- preserve the existing useful comment and add one more short comment only where event ordering is non-obvious

### `extensions/codex-content/patch/types.ts`

Problem:

- the types are correct, but the file reads more like a flat dump than a structured type surface

Fix needed:

- group related types under small comment headers such as errors, patch hunks, results, and virtual file state
- extract the error code union into a named type alias

### `extensions/codex-content/patch/index.ts`

Problem:

- no major issue; this is mainly an API hygiene concern

Fix needed:

- keep export order consistent with usage and importance

### `extensions/codex-content/images/index.ts`

Problem:

- no major issue; this is mainly a barrel consistency concern

Fix needed:

- keep export order stable and intentional

### `extensions/codex-content/renderers/common.ts`

Problem:

- naming is mostly clear already, but helper grouping can get noisy as more shared renderer helpers move in

Fix needed:

- keep the file small and split again if it grows beyond a compact shared renderer surface

### `extensions/codex-content/exploration/ui.ts`

Problem:

- the legacy widget key constants make the file feel transitional

Fix needed:

- remove them once compatibility is no longer needed
- until then, keep the compatibility path isolated in one clearly named helper

### `extensions/codex-content/renderers/edit.ts`

Problem:

- no major issue beyond duplication with `write.ts`

Fix needed:

- once shared helpers exist, reduce this file to edit-specific behavior only

### `extensions/codex-content/renderers/write.ts`

Problem:

- no major issue beyond duplication with `edit.ts`

Fix needed:

- once shared helpers exist, reduce this file to write-specific behavior only

### `extensions/codex-content/renderers/bash.ts`

Problem:

- no major issue beyond compact control flow and inline body selection

Fix needed:

- keep it short and explicit after helper extraction

### `extensions/codex-content/renderers/request-user-input.ts`

Problem:

- no major issue beyond local helper duplication and hidden-count cleverness

Fix needed:

- keep it focused on display-only concerns after moving parsing and shortening helpers out

### `extensions/codex-content/compatibility-tools/view-image.ts`

Problem:

- no major issue beyond response-builder duplication and validation order

Fix needed:

- keep it very small after helper extraction

---

## Suggested implementation order

1. Extract shared text and renderer helpers.
2. Refactor `workflow/request-user-input.ts` and `workflow/plan.ts` to use them.
3. Refactor `compatibility-tools/find-files.ts` and `compatibility-tools/grep-files.ts` around shared file-match utilities.
4. Refactor `compatibility-tools/read-file.ts` and `compatibility-tools/shell-command.ts` into smaller helper-driven flows.
5. Refactor `exploration/state.ts`, `exploration/ui.ts`, and `exploration/events.ts` into clearer module boundaries.
6. Refactor `images/resize.ts` and `images/photon.ts` into pipeline-style helpers.
7. Refactor `patch/parser.ts`, `patch/matching.ts`, and finally `patch/apply.ts` as the largest readability cleanup.
8. Split oversized tests after the runtime structure stabilizes.

---

## Acceptance criteria

- the largest files no longer mix unrelated responsibilities
- repeated text formatting and result-shaping logic lives in shared helpers
- core control flow uses early returns and explicit helper names instead of nested ternaries
- readers can identify where parsing, rendering, state tracking, and tool execution live without tracing through long files
- test files are grouped by behavior or module instead of acting as catch-all suites
