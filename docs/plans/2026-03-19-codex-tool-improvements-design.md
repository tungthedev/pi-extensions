# Codex Tool Improvements Design

Date: 2026-03-19

## Goal

Improve the core compatibility tools in `extensions/codex-content/` so they are more useful, safer, and closer to the stronger behaviors already proven in `../dots/pi/extensions/tools/`.

This design intentionally keeps the existing parameter schemas for the current Codex compatibility tools unchanged.

The only new surface added in this design is a standalone `find_files` tool.

This document is a design artifact only. It does not start implementation by itself.

---

## Scope

### In scope

- improve `shell_command`
- improve `grep_files`
- improve `read_file`
- improve `list_dir`
- improve `apply_patch`
- add one new `find_files` tool
- tighten renderer behavior where it helps the tool feel clearer in the transcript
- add focused regression tests for the behavior changes

### Out of scope

- changing the parameter names or required/optional fields of existing tools
- adding a separate `edit` tool in this phase
- adding new optional flags to `grep_files` in this phase
- reworking workflow tools like `update_plan` or `request_user_input`
- changing subagent APIs
- exact byte-for-byte parity with either Pi built-ins or Codex internals

---

## Existing tool surface

Today `extensions/codex-content/` exposes the following core compatibility tools:

- `read_file`
- `list_dir`
- `grep_files`
- `shell_command`
- `apply_patch`
- `view_image`

This package already has several strong foundations:

- `read_file` supports indentation-aware reads and streaming slice reads
- `list_dir` supports numbered, paginated output with depth control
- `apply_patch` already applies changes through a virtual-file layer and commits touched files atomically
- compact Codex-style renderers already exist for shell and patch results

The main gaps are behavioral rather than structural:

- `shell_command` is too bare compared with the stronger reference `bash` tool
- `grep_files` is useful but still thin, especially around error handling and result hygiene
- `read_file` lacks some path and secret-safety behaviors that make it more robust in real repos
- `apply_patch` could reject bad LLM patch patterns earlier and preserve file encodings more carefully
- there is no Codex-native file discovery tool comparable to a focused `glob` / `find`

---

## Design principles

1. Keep existing tool parameters stable.
2. Prefer behavior improvements over schema churn.
3. Add one missing capability only where it closes a real workflow gap.
4. Make outputs more actionable without making them noisier.
5. Preserve existing strengths instead of replacing them with a different mental model.
6. Add tests only for meaningful runtime behavior and regressions.

---

## Compatibility rule

### Existing tools

The following tools must keep their current schemas unchanged:

- `shell_command(command, workdir?, timeout_ms?, login?)`
- `grep_files(pattern, include?, path?, limit?)`
- `read_file(file_path, offset?, limit?, mode?, indentation?)`
- `list_dir(dir_path, offset?, limit?, depth?)`
- `apply_patch(input)`

This means:

- no field renames
- no required-field changes
- no meaning-changing repurposing of existing fields
- no extra optional fields in this phase

### New tool

This design adds one new tool:

- `find_files`

Because it is a new tool, it may define its own schema without breaking compatibility.

---

## High-level changes by tool

## `shell_command`

### Keep the current params

Keep the current schema exactly as-is:

- `command`
- `workdir?`
- `timeout_ms?`
- `login?`

### Problems today

- shell startup behavior is noisy and less deterministic than it should be
- command execution does not normalize common model mistakes like `cd dir && cmd`
- output capture is bounded, but the final output is less informative than it could be
- timeout / abort / non-zero exit behavior is not differentiated cleanly enough for models
- command execution lacks some of the stronger process shutdown behavior from the reference `bash` tool

### Proposed behavior changes

1. Make non-login execution the default behavior unless `login: true` is explicitly requested.
2. Normalize `cd <dir> && <cmd>` or `cd <dir>; <cmd>` into a resolved `workdir` plus the remaining command.
3. Strip a trailing background operator like `&` and treat it as an unsupported model habit rather than honoring it.
4. Improve timeout and abort handling:
   - terminate with `SIGTERM`
   - escalate to `SIGKILL` after a short grace period
   - keep partial output when a command is aborted or times out
5. Change output formatting so it clearly distinguishes:
   - command
   - output
   - exit code
   - timeout / abort reason
6. Preserve bounded capture, but format the visible output as a head-and-tail window rather than only keeping the tail when the buffer is pressured.
7. Resolve `workdir` first and fail fast with an explicit message when the directory does not exist.
8. Keep `login` in the schema, but treat it as an explicit opt-in for shell init behavior.

### Compatibility caveat

This is the main intentional non-schema behavior change in this design.

Today omitted `login` effectively behaves like a login shell. After this change, omitted `login` should behave like `false`.

That is intentional because the non-login default is quieter, more deterministic, and a better fit for tool execution in coding sessions.

Callers that truly need shell-init behavior can still request it explicitly with `login: true`.

### Non-goals for `shell_command`

- no permission-rule engine in this phase
- no git trailer injection in this phase
- no parameter aliases like `cwd`

### Expected outcome

`shell_command` becomes quieter, safer, and more predictable without any schema change.

---

## `grep_files`

### Keep the current params

Keep the current schema exactly as-is:

- `pattern`
- `include?`
- `path?`
- `limit?`

### Problems today

- it only lightly classifies ripgrep failures
- it stats every matched file before sorting, which is wasteful in huge repos
- path handling can be clearer and more deterministic
- output truncation is correct but not very instructive
- it does not apply enough default search hygiene

### Proposed behavior changes

1. Run ripgrep with stronger defaults for repo search hygiene:
   - include hidden files
   - suppress noisy messages
   - exclude `.git/`
   - exclude `.jj/`
2. Resolve the search root first and run the command relative to that root where appropriate.
3. Distinguish these result classes clearly:
   - no matches
   - invalid regex / ripgrep parse error
   - missing path
   - execution failure
4. Keep returning file paths only, but improve the text payload:
   - add a short match count header
   - keep file paths line-oriented for easy reuse
   - add a better continuation hint when truncated
5. Keep sorting by modification time with full correctness in this phase by:
   - collecting matched paths first
   - deduplicating paths
   - stat-ing the full matched set
   - skipping unreadable files with an explicit skipped-count note
6. Keep stable tie-breaking by normalized path.
7. Preserve current `include` behavior as the file-filter mechanism.

This intentionally favors deterministic ordering over bounded stat-cost optimization in v1.

If large-repo performance later becomes a real bottleneck, a follow-up design can introduce an explicitly best-effort ranking strategy.

### Important constraint

Do not add previews, context lines, `literal`, or `case_sensitive` in this phase.

Those are useful future enhancements, but they would either change the contract materially or deserve explicit params.

### Expected outcome

`grep_files` stays a lightweight file-discovery-by-content tool, but becomes more robust and more scalable in large repos.

---

## `read_file`

### Keep the current params

Keep the current schema exactly as-is:

- `file_path`
- `offset?`
- `limit?`
- `mode?`
- `indentation?`

### Problems today

- path resolution is still minimal compared with the stronger reference `read` tool
- secret-like files are not blocked
- some platform-specific path variants can still fail even when the visible path is correct
- truncation is safe, but the result text can be more explicit about what happened

### Proposed behavior changes

1. Improve path resolution to support:
   - leading `@` stripping
   - `~` expansion
   - absolute or cwd-relative resolution
2. Add macOS-friendly path variant fallback for common normalization mismatches.
3. Block reads of obvious secret files such as:
   - `.env`
   - `.env.*`
     while still allowing common safe templates like:
   - `.env.example`
   - `.env.sample`
   - `.env.template`
4. Keep image redirect behavior, but ensure the error/result text clearly steers the model to `view_image`.
5. Keep slice and indentation modes intact, but make truncation notices more explicit in the returned text when output is budget-trimmed.
6. Preserve the current streaming slice implementation for large but allowed files.
7. Improve file-not-found and wrong-type errors so they mention the fully resolved path.

### Important constraint

Do not collapse `read_file` into a combined file-or-directory tool.

`list_dir` already exists and should remain separate in the Codex compatibility layer.

### Expected outcome

`read_file` becomes more reliable on real local filesystems and safer around secret-bearing files without changing its schema.

---

## `list_dir`

### Keep the current params

Keep the current schema exactly as-is:

- `dir_path`
- `offset?`
- `limit?`
- `depth?`

### Problems today

- the core output format is already good, but large or partially unreadable trees can degrade the experience
- errors are currently all-or-nothing for some filesystem cases
- the tool could provide clearer continuation and summary messaging in very large directories

### Proposed behavior changes

1. Preserve the current numbered output format because it is already strong for follow-up reads.
2. Keep the existing type labels and relative entry display.
3. Improve traversal resilience:
   - skip unreadable child directories when safe to do so
   - surface a skipped-entry note rather than failing the entire listing
4. Keep the existing global scan cap, but make the failure message more actionable.
5. Preserve deterministic sorting.
6. Keep depth semantics unchanged.
7. Continue to avoid traversing symlink targets as directories.

### Expected outcome

`list_dir` remains stable and familiar, with better behavior on imperfect filesystems and very large trees.

---

## `apply_patch`

### Keep the current params

Keep the current schema exactly as-is:

- `input`

### Problems today

- patch application is already strong structurally, but it trusts more input patterns than it should
- text-file encoding and line-ending preservation could be more careful
- some LLM failure modes could be rejected before the patch engine starts applying changes

### Proposed behavior changes

1. Preserve the current freeform-wrapper behavior for:
   - raw patch text
   - heredoc body
   - simple `apply_patch` heredoc invocation
2. Add early guardrails for clearly bad model output, especially placeholder-style redaction text such as:
   - `[REDACTED]`
   - `[... omitted ...]`
   - `rest of file unchanged`
3. Preserve BOM and dominant line ending style when updating existing text files.
4. Detect obviously binary targets and fail with a clearer message instead of writing corrupted text.
5. Keep virtual-file atomicity as-is.
6. Improve error messaging for:
   - context mismatch
   - destination already exists
   - target missing for delete/update
   - malformed patch grammar
7. Keep multi-file result details because the renderer already uses them well.

### Implementation notes

Line-ending and BOM preservation should be implemented in `extensions/codex-content/patch/apply.ts`, not only in the wrapper at `extensions/codex-content/compatibility-tools/apply-patch.ts`.

The wrapper should stay thin and continue to focus on input normalization, result shaping, and renderer-facing details.

### Expected outcome

`apply_patch` keeps its current strong architecture while gaining the practical safety features the reference `edit-file` tool has learned to enforce.

---

## New tool: `find_files`

### Why add it

There is still a real workflow gap between `list_dir` and `grep_files`:

- `list_dir` is good when the caller already knows roughly where to look
- `grep_files` is good when the caller knows content to search for
- neither tool is good for fast filename/path discovery across a large repo

The reference toolset solves this with a dedicated glob-style finder. `codex-content` should add the same missing capability as a standalone tool rather than overloading `list_dir`.

### Tool name

- `find_files`

### Proposed params

```ts
{
  pattern: string;
  path?: string;
  limit?: number;
  offset?: number;
}
```

### Parameter intent

- `pattern`: glob-style file pattern such as `**/*.ts` or `src/**/*.test.ts`
- `path?`: optional search root; defaults to current working directory
- `limit?`: maximum number of results to return
- `offset?`: result offset for pagination

### Behavior

1. Use `rg --files` with hidden-file support.
2. Exclude `.git/` and `.jj/` by default.
3. Sort results by modification time descending.
4. Return file paths only, one per line.
5. Include a concise footer when paginated or truncated.
6. Resolve `path` first and fail clearly if it does not exist.
7. Return absolute paths so the results can be fed directly into `read_file` without another resolution step.

This absolute-path choice is intentional.

`find_files` is optimized for piping results into follow-up tools like `read_file`, while `list_dir` is optimized for human-readable tree inspection with numbered relative entries.

The two tools should therefore stay different here.

### Why not overload `list_dir`

Because `list_dir` and `find_files` solve different jobs:

- `list_dir` is bounded tree inspection
- `find_files` is pattern-based repo discovery

Keeping them separate preserves clarity and avoids hidden semantic complexity.

---

## Renderer improvements

The tool behavior work should be paired with small renderer improvements where they materially help transcript readability.

### `shell_command`

- keep the compact `Ran ...` summary shape
- show exit code consistently
- show a small preview of output lines
- show timeout / abort states distinctly from ordinary non-zero exits

### `apply_patch`

- keep the existing compact single-file vs multi-file summary behavior
- show clearer failure previews when patch parsing or application fails early

### `grep_files`, `read_file`, `list_dir`, `find_files`

- renderer work is optional in the first pass
- plain text output is acceptable as long as the textual format is crisp and consistent

---

## Proposed file changes

### New files

```text
docs/plans/
  2026-03-19-codex-tool-improvements-design.md

extensions/codex-content/compatibility-tools/
  find-files.ts
  find-files.test.ts
```

### Updated files

```text
extensions/codex-content/compatibility-tools/index.ts
extensions/codex-content/compatibility-tools/runtime.ts
extensions/codex-content/compatibility-tools/shell-command.ts
extensions/codex-content/compatibility-tools/grep-files.ts
extensions/codex-content/compatibility-tools/read-file.ts
extensions/codex-content/compatibility-tools/list-dir.ts
extensions/codex-content/compatibility-tools/apply-patch.ts
extensions/codex-content/renderers/bash.ts
extensions/codex-content/renderers/apply-patch.ts
```

### Optional internal helpers

If implementation becomes cleaner, add small private helpers for:

- path normalization and secret-file checks
- shell command preprocessing
- ripgrep result classification
- BOM / line-ending preservation

These should remain internal utilities rather than new tools.

---

## Testing plan

Add focused tests for runtime behavior with real value.

### `shell_command`

- resolves `cd dir && cmd` into the intended working directory behavior
- preserves partial output on timeout
- reports abort and timeout distinctly
- rejects missing working directories clearly

### `grep_files`

- reports no-match vs invalid-regex distinctly
- excludes `.git/` and `.jj/` by default
- sorts by mtime descending with stable ties
- truncates with a clear continuation note

### `read_file`

- expands `~`
- strips leading `@`
- blocks `.env` but allows `.env.example`
- preserves current indentation-mode output shape

### `list_dir`

- keeps numbered output stable
- preserves offset and limit semantics
- reports scan-limit overflow clearly

### `apply_patch`

- rejects placeholder/redaction patch content
- preserves BOM and CRLF when updating existing files
- keeps atomic multi-file behavior on failure

### `find_files`

- matches glob patterns correctly
- sorts by mtime descending
- paginates with `offset` and `limit`
- excludes `.git/` and `.jj/`

---

## Rollout order

Implement in this order:

1. `shell_command`
2. `find_files`
3. `read_file`
4. `grep_files`
5. `apply_patch`
6. `list_dir`

Reasoning:

- `shell_command` and `find_files` close the most obvious workflow gaps first
- `read_file` is a lower-risk helper improvement and strengthens shared path-handling expectations early
- `grep_files` follows once the path-handling and exploration baseline is cleaner
- `apply_patch` guardrails matter, but the current implementation is already structurally strong
- `list_dir` is the least urgent because its current behavior is already solid

---

## Acceptance criteria

This design is successful when:

- all existing compatibility tools keep their current parameter schemas
- `shell_command` feels quieter and more robust in normal repo usage
- `grep_files` remains file-list-only but behaves better in large repos and on errors
- `read_file` gains secret blocking and stronger path resolution without losing current modes
- `apply_patch` preserves text-file formatting more carefully and rejects obvious bad patch content
- `list_dir` remains stable while becoming more resilient on imperfect trees
- `find_files` gives the agent a dedicated filename/path discovery tool that complements `list_dir` and `grep_files`

---

## Deferred ideas

These are intentionally deferred to keep this phase focused on tool improvement without schema churn:

- add `literal` and `case_sensitive` to `grep_files`
- add preview/context output to `grep_files`
- add a dedicated `edit` tool
- add command permission policies to `shell_command`
- add transcript-rich renderers for every compatibility tool
- add a combined file metadata API

---

## Recommendation

Adopt this design as a focused backward-compatible improvement pass for `extensions/codex-content/`.

The main rule should remain simple:

- improve tool behavior aggressively
- keep existing tool params stable
- add exactly one missing discovery tool: `find_files`
