# Cursor Agent CLI Tool Surface

Source inspected: `/Users/hoalong/.local/share/cursor-agent/versions/2026.04.30-4edb302`.

This document is based on static analysis of the bundled JavaScript files. The installed bundle preserves tool case names, selected UI summary strings, generated protobuf class fields, and executor wrapper input/output mappings. It does not appear to include a complete human-written JSON schema with prose descriptions for every tool. Where an exact literal description string was found, it is quoted. Where no literal description string was found, the description cell says `Not present as a literal description in the inspected bundle`.

Important sources:

- `index.js`: generated protobuf modules and agent protocol wiring.
- `1357.index.js`: executor wrappers for local tools such as read, grep, list, delete, fetch, MCP resources, screen recording, and stdin.
- `7414.index.js`: ACP/tool summarization, raw input extraction, raw output extraction, and exact UI title strings.
- `7434.index.js`: terminal UI tool switch and rendered tool-call cases.
- `2556.index.js`: subagent/task host adapter.

Type notes:

- `string`, `number`, `boolean`, `object`, and `array<T>` are inferred from generated protobuf defaults, executor payload construction, and UI extraction code.
- Optionality is not always recoverable from the compiled JS protobuf output because scalar fields default to empty strings, zero, or false.
- `result.case` is a protobuf oneof case name.

## Main Tool Calls

### `shellToolCall`

Exact UI summary string: dynamic. When `command` is present the UI title is the command wrapped in backticks; otherwise it uses `Terminal`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name                       |      Type | Description                                                   |
| -------------------------- | --------: | ------------------------------------------------------------- |
| `command`                  |  `string` | Not present as a literal description in the inspected bundle. |
| `cwd` / `workingDirectory` |  `string` | Not present as a literal description in the inspected bundle. |
| `sandboxPolicy`            |  `object` | Not present as a literal description in the inspected bundle. |
| `isBackground`             | `boolean` | Not present as a literal description in the inspected bundle. |
| `toolCallId`               |  `string` | Not present as a literal description in the inspected bundle. |

Observed output/result fields:

| Name       |                 Type | Notes                                               |
| ---------- | -------------------: | --------------------------------------------------- |
| `shellId`  | `string` or `number` | Returned for background/running shell results.      |
| `pid`      |             `number` | Returned for background/running shell results.      |
| `exitCode` |             `number` | Extracted for `success` and `failure` result cases. |
| `stdout`   |             `string` | Extracted for `success` and `failure` result cases. |
| `stderr`   |             `string` | Extracted for `success` and `failure` result cases. |

Observed result cases: `success`, `failure`, `error`, `rejected`, `permissionDenied`.

Hook payload before execution:

| Name      |     Type |
| --------- | -------: |
| `command` | `string` |
| `cwd`     | `string` |
| `sandbox` | `object` |

### `writeShellStdinToolCall`

Exact UI summary string: `Write to stdin (shell ${shellId})`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name      |                 Type | Description                                                   |
| --------- | -------------------: | ------------------------------------------------------------- |
| `shellId` | `string` or `number` | Not present as a literal description in the inspected bundle. |
| `chars`   |             `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name           |                 Type |
| -------------- | -------------------: |
| `shell_id`     | `string` or `number` |
| `chars_length` |             `number` |

Observed output/result fields:

| Name       |                 Type |
| ---------- | -------------------: |
| `shell_id` | `string` or `number` |
| `success`  |            `boolean` |
| `error`    |             `string` |

Observed result cases: `success`, `error`.

### `readToolCall`

Exact UI summary strings:

- `Read File`
- `Read ${path}`
- `Read ${path} (${start} - ${end})`
- `Read ${path} (from line ${line})`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name     |     Type | Description                                                   |
| -------- | -------: | ------------------------------------------------------------- |
| `path`   | `string` | Not present as a literal description in the inspected bundle. |
| `offset` | `number` | Not present as a literal description in the inspected bundle. |
| `limit`  | `number` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name        |     Type |
| ----------- | -------: |
| `file_path` | `string` |

Observed output/result fields:

| Name             |     Type | Notes                                                                  |
| ---------------- | -------: | ---------------------------------------------------------------------- |
| `content`        | `string` | Present when `result.case === "success"` and output case is `content`. |
| `content_length` | `number` | Executor success summary.                                              |
| `file_path`      | `string` | Executor success summary.                                              |
| `error`          | `string` | Error case.                                                            |

Observed result cases: `success`, `error`, `rejected`, `fileNotFound`, `permissionDenied`, `invalidFile`.

Post-execution hook: `beforeReadFile` receives file content and file path metadata after a successful read, before the result is allowed onward.

### `editToolCall`

Exact UI summary strings:

- `Edit File`
- `Edit \`${path}\``

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name         |     Type | Description                                                   |
| ------------ | -------: | ------------------------------------------------------------- |
| `path`       | `string` | Not present as a literal description in the inspected bundle. |
| `old_string` | `string` | Inferred from hook conversion of diffs into edit objects.     |
| `new_string` | `string` | Inferred from hook conversion of diffs into edit objects.     |

Observed output/result fields:

| Name                    |     Type | Notes                                           |
| ----------------------- | -------: | ----------------------------------------------- |
| `path`                  | `string` | Edited path.                                    |
| `diffString`            | `string` | May be used to reconstruct old/new text.        |
| `beforeFullFileContent` | `string` | May be present on success.                      |
| `afterFullFileContent`  | `string` | May be present on success.                      |
| `fileContentAfterWrite` | `string` | Returned when requested after write.            |
| `linesCreated`          | `number` | Returned when file content after write is read. |
| `fileSize`              | `number` | Returned when file content after write is read. |

Observed content extraction: success can be converted into a diff block with `path`, `oldText`, and `newText`.

### `deleteToolCall`

Exact UI summary strings:

- `Delete File`
- `Delete \`${path}\``

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name   |     Type | Description                                                   |
| ------ | -------: | ------------------------------------------------------------- |
| `path` | `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name        |     Type |
| ----------- | -------: |
| `file_path` | `string` |

Observed output/result fields:

| Name          |      Type |
| ------------- | --------: |
| `file_path`   |  `string` |
| `deleted`     | `boolean` |
| `deletedFile` |  `string` |
| `reason`      |  `string` |
| `error`       |  `string` |

Observed result cases: `success`, `fileNotFound`, `notFile`, `permissionDenied`, `fileBusy`, `rejected`, `error`.

### `lsToolCall`

Exact UI summary strings:

- `List the current directory's contents`
- `List the \`${path}\` directory's contents`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name     |                        Type | Description                                                   |
| -------- | --------------------------: | ------------------------------------------------------------- |
| `path`   |                    `string` | Not present as a literal description in the inspected bundle. |
| `ignore` | `array<string>` or `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name        |                        Type |
| ----------- | --------------------------: |
| `file_path` |                    `string` |
| `ignore`    | `array<string>` or `string` |

Observed output/result fields:

| Name        |      Type |
| ----------- | --------: |
| `file_path` |  `string` |
| `success`   | `boolean` |
| `reason`    |  `string` |
| `error`     |  `string` |

Observed result cases: `success`, `error`, `rejected`, `timeout`.

### `grepToolCall`

Exact UI summary string: dynamic `grep` command reconstruction, including flags such as `-i`, `-n`, `-A`, `-B`, `-C`, `-l`, `-c`, `--include`, `--type`, and `-P`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name         |      Type | Description                                                   |
| ------------ | --------: | ------------------------------------------------------------- |
| `pattern`    |  `string` | Not present as a literal description in the inspected bundle. |
| `path`       |  `string` | Not present as a literal description in the inspected bundle. |
| `glob`       |  `string` | Not present as a literal description in the inspected bundle. |
| `outputMode` |  `string` | Observed values include `files_with_matches` and `count`.     |
| `i`          | `boolean` | Reflected as `-i`.                                            |
| `n`          | `boolean` | Reflected as `-n`.                                            |
| `A`          |  `number` | Reflected as `-A`.                                            |
| `B`          |  `number` | Reflected as `-B`.                                            |
| `C`          |  `number` | Reflected as `-C`.                                            |
| `headLimit`  |  `number` | Reflected as `head -${headLimit}`.                            |
| `type`       |  `string` | Reflected as `--type=${type}`.                                |
| `multiline`  | `boolean` | Reflected as `-P`.                                            |

Executor hook input summary:

| Name          |     Type |
| ------------- | -------: |
| `pattern`     | `string` |
| `file_path`   | `string` |
| `glob`        | `string` |
| `output_mode` | `string` |

Observed output/result fields:

| Name           |      Type |
| -------------- | --------: |
| `totalMatches` |  `number` |
| `truncated`    | `boolean` |
| `error`        |  `string` |

Observed result cases: `success`, `error`.

### `globToolCall`

Exact UI summary string: dynamic. Starts with `Find`, optionally followed by path and pattern.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name              |     Type | Description                                                   |
| ----------------- | -------: | ------------------------------------------------------------- |
| `pattern`         | `string` | Not present as a literal description in the inspected bundle. |
| `globPattern`     | `string` | Not present as a literal description in the inspected bundle. |
| `path`            | `string` | Not present as a literal description in the inspected bundle. |
| `targetDirectory` | `string` | Used for location extraction.                                 |

Observed output/result fields:

| Name          |     Type |
| ------------- | -------: |
| `resultCount` | `number` |
| `error`       | `string` |

### `semSearchToolCall`

Exact UI summary strings:

- `Codebase Search`
- `Search: "${query}"`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name    |     Type | Description                                                   |
| ------- | -------: | ------------------------------------------------------------- |
| `query` | `string` | Not present as a literal description in the inspected bundle. |

Observed output/result fields:

| Name          |     Type |
| ------------- | -------: |
| `resultCount` | `number` |
| `error`       | `string` |

### `readLintsToolCall`

Exact UI summary strings:

- `Read Lints`
- `Read Lints \`${path}\``
- `Read Lints \`${firstPath}\` (+${additionalCount} more)`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name    |            Type | Description                                                   |
| ------- | --------------: | ------------------------------------------------------------- |
| `paths` | `array<string>` | Not present as a literal description in the inspected bundle. |
| `path`  |        `string` | Executor wrapper also has a single-path form.                 |

Generated protobuf fields for `ReadLintsToolArgs`:

| Name    |            Type |
| ------- | --------------: |
| `paths` | `array<string>` |

Observed output/result fields:

| Name                     |            Type |
| ------------------------ | --------------: |
| `fileDiagnostics`        | `array<object>` |
| `totalFiles`             |        `number` |
| `totalDiagnostics`       |        `number` |
| `diagnostics_count`      |        `number` |
| `error` / `errorMessage` |        `string` |

Observed result cases: `success`, `error`, `rejected`, `fileNotFound`, `permissionDenied`.

### `webSearchToolCall`

Exact UI summary strings:

- `Web Search`
- `Web Search: "${searchTerm}"`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name         |     Type | Description                                                   |
| ------------ | -------: | ------------------------------------------------------------- |
| `searchTerm` | `string` | Not present as a literal description in the inspected bundle. |

Observed interaction result cases: `approved`, `rejected`.

Approval behavior: in ACP mode the request can be auto-approved by run-everything mode or by allowlist; otherwise it requests web permission.

### `webFetchToolCall`

Exact UI summary strings:

- `Web Fetch`
- `Web Fetch: ${url}`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name  |     Type | Description                                                   |
| ----- | -------: | ------------------------------------------------------------- |
| `url` | `string` | Not present as a literal description in the inspected bundle. |

Observed output/result fields:

| Name                         |      Type |
| ---------------------------- | --------: |
| `url`                        |  `string` |
| `status_code` / `statusCode` |  `number` |
| `content_length`             |  `number` |
| `success`                    | `boolean` |
| `error`                      |  `string` |

Observed result cases: `success`, `error`; interaction result cases: `approved`, `rejected`.

### `mcpToolCall`

Exact UI summary string: `${providerIdentifier}: ${toolName}` with fallbacks `MCP` and `tool`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name                 |     Type | Description                                                   |
| -------------------- | -------: | ------------------------------------------------------------- |
| `providerIdentifier` | `string` | Not present as a literal description in the inspected bundle. |
| `toolName`           | `string` | Not present as a literal description in the inspected bundle. |
| `args`               | `object` | Not present as a literal description in the inspected bundle. |

Observed output/result fields: MCP-specific dynamic result payload.

### `listMcpResourcesToolCall`

Exact UI summary strings:

- `List MCP Resources`
- `List MCP Resources (${server})`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name     |     Type | Description                                                   |
| -------- | -------: | ------------------------------------------------------------- |
| `server` | `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name     |     Type |
| -------- | -------: |
| `server` | `string` |

Observed output/result fields:

| Name              |      Type |
| ----------------- | --------: |
| `resources_count` |  `number` |
| `success`         | `boolean` |
| `error`           |  `string` |
| `reason`          |  `string` |

Observed result cases: `success`, `error`, `rejected`.

### `readMcpResourceToolCall`

Exact UI summary strings:

- `Fetch MCP Resource`
- `Fetch MCP Resource ${uri}`
- `Fetch MCP Resource (${server}) ${uri}`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name                             |     Type | Description                                                   |
| -------------------------------- | -------: | ------------------------------------------------------------- |
| `server`                         | `string` | Not present as a literal description in the inspected bundle. |
| `uri`                            | `string` | Not present as a literal description in the inspected bundle. |
| `downloadPath` / `download_path` | `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name            |     Type |
| --------------- | -------: |
| `server`        | `string` |
| `uri`           | `string` |
| `download_path` | `string` |

Observed output/result fields:

| Name                             |      Type |
| -------------------------------- | --------: |
| `uri`                            |  `string` |
| `name`                           |  `string` |
| `mime_type` / `mimeType`         |  `string` |
| `download_path` / `downloadPath` |  `string` |
| `content_type`                   |  `string` |
| `content_length`                 |  `number` |
| `success`                        | `boolean` |
| `error`                          |  `string` |
| `reason`                         |  `string` |

Observed result cases: `success`, `error`, `rejected`, `notFound`.

### `updateTodosToolCall`

Exact UI summary strings:

- `Update TODOs`
- `Update TODOs: ${todoContents}`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name              |            Type | Description                                                   |
| ----------------- | --------------: | ------------------------------------------------------------- |
| `todos`           | `array<object>` | Not present as a literal description in the inspected bundle. |
| `todos[].content` |        `string` | Used by the UI summary.                                       |

Observed output/result fields: updated todo state.

### `readTodosToolCall`

Exact UI summary string: `Read TODOs`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: none observed.

Observed output/result fields: todo state.

### `askQuestionToolCall`

Exact UI summary strings:

- `Ask Question`
- `${title}` when a title is present.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name        |            Type | Description                                                      |
| ----------- | --------------: | ---------------------------------------------------------------- |
| `title`     |        `string` | Not present as a literal description in the inspected bundle.    |
| `questions` | `array<object>` | Not present as a literal description in the inspected bundle.    |
| `runAsync`  |       `boolean` | When true, the prompt is queued and an async result is returned. |

Observed result cases: user response, `async`, `rejected`.

### `switchModeToolCall`

Exact UI summary string: `Switch Mode: ${targetModeId}`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name           |     Type | Description                                                   |
| -------------- | -------: | ------------------------------------------------------------- |
| `targetModeId` | `string` | Not present as a literal description in the inspected bundle. |
| `explanation`  | `string` | Not present as a literal description in the inspected bundle. |

Observed interaction result cases: `approved`, `rejected`.

### `createPlanToolCall`

Exact UI summary strings:

- `Create Plan`
- `Create Plan: ${name}`
- `Processing plan...`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name   |                        Type | Description                                                   |
| ------ | --------------------------: | ------------------------------------------------------------- |
| `name` |                    `string` | Not present as a literal description in the inspected bundle. |
| `plan` | `object` or `array<object>` | Not present as a literal description in the inspected bundle. |

Observed result cases: accepted, rejected, error.

### `generateImageToolCall`

Exact UI summary strings:

- `Generate Image`
- `Generate Image: ${description.slice(0,50)}...`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name          |     Type | Description                                                   |
| ------------- | -------: | ------------------------------------------------------------- |
| `description` | `string` | Not present as a literal description in the inspected bundle. |
| `filename`    | `string` | Not present as a literal description in the inspected bundle. |

Observed interaction result cases: `approved`, `rejected`.

### `aiAttributionToolCall`

Exact UI summary string: not found in extracted summarizer switch; rendered by `ai-attribution-tool-ui.tsx`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer. Related modules include AI code tracking and commit scoring.

### `taskToolCall`

Exact UI summary string: `Task: ${description}` with fallback `Subagent task`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name                   |                 Type | Description                                                                                                                                                       |
| ---------------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`               |             `string` | Not present as a literal description in the inspected bundle.                                                                                                     |
| `description`          |             `string` | Used in the exact UI summary.                                                                                                                                     |
| `subagentType`         | `string` or `object` | Normalized to names such as `general-purpose`, `computer-use`, `explore`, `shell`, `video-review`, `browser-use`, `vm-setup-helper`, `debug`, and `cursor-guide`. |
| `resumeAgentId`        |             `string` | Subagent adapter supports resuming by UUID.                                                                                                                       |
| `forkAgentId`          |             `string` | Explicitly rejected by the CLI subagent adapter.                                                                                                                  |
| `runInBackground`      |            `boolean` | Runs subagent in background and returns immediately.                                                                                                              |
| `continuationConfig`   |             `object` | Controls continuation loops and child completion collection.                                                                                                      |
| `toolCallId`           |             `string` | Tracks parent tool call.                                                                                                                                          |
| `parentConversationId` |             `string` | Links child to parent.                                                                                                                                            |

Observed output/result fields:

| Name               |      Type |
| ------------------ | --------: |
| `status`           |  `string` |
| `error`            |  `string` |
| `finalMessage`     |  `string` |
| `backgroundReason` |  `string` |
| `toolCallCount`    |  `number` |
| `isBackground`     | `boolean` |

Observed statuses: `completed`, `error`, `aborted`, `background`. UI mapping returns `success`, `error`, or `cancelled`.

### `awaitToolCall`

Exact UI summary string: rendered by `await-tool-ui.tsx`; no exact summarizer title was found in the inspected excerpt.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not fully recovered. It is associated with waiting for background/async work.

Observed output/result fields: completion/cancellation state for awaited operation.

### `computerUseToolCall`

Exact UI summary string: `Computer Use: ${action}` with fallback `action`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name           |                       Type | Description                                                                  |
| -------------- | -------------------------: | ---------------------------------------------------------------------------- |
| `action`       | `string` or `oneof object` | Observed action cases include mouse and keyboard operations in the executor. |
| `coordinate`   |                   `object` | Used by mouse actions.                                                       |
| `coordinate.x` |                   `number` | Not present as a literal description in the inspected bundle.                |
| `coordinate.y` |                   `number` | Not present as a literal description in the inspected bundle.                |
| `text`         |                   `string` | Used by text/typing actions.                                                 |
| `actions`      |            `array<object>` | Executor wrapper summarizes `actions.length`.                                |

Executor hook input summary:

| Name            |     Type |
| --------------- | -------: |
| `actions_count` | `number` |

Observed output/result fields:

| Name                           |     Type |
| ------------------------------ | -------: |
| `action_count` / `actionCount` | `number` |
| `duration_ms` / `durationMs`   | `number` |
| `screenshot`                   | `string` |
| `cursorPosition`               | `object` |
| `error`                        | `string` |

Observed result cases: `success`, `error`.

### `recordScreenToolCall`

Exact UI summary string: `Record Screen`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name             |               Type | Description                                                   |
| ---------------- | -----------------: | ------------------------------------------------------------- |
| `mode`           | `string` or `enum` | Not present as a literal description in the inspected bundle. |
| `saveAsFilename` |           `string` | Not present as a literal description in the inspected bundle. |

Executor hook input summary:

| Name               |               Type |
| ------------------ | -----------------: |
| `mode`             | `string` or `enum` |
| `save_as_filename` |           `string` |

Observed output/result fields:

| Name          |     Type |
| ------------- | -------: |
| `result_type` | `string` |

Observed result cases: success-like result cases and `failure`.

## Additional Internal Or Less-Exposed Tool Calls

### `applyAgentDiffToolCall`

Exact UI summary string: `Apply Agent Diff`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name   |     Type |
| ------ | -------: |
| `path` | `string` |

Observed output/result fields: completed output can include `appliedChanges[]`, where each change has a `path`.

### `fetchToolCall`

Exact UI summary strings:

- `Fetch`
- `Fetch: ${url}`

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters:

| Name  |     Type |
| ----- | -------: |
| `url` | `string` |

This appears to share executor behavior with `Fetch` / web fetch style tooling.

### `reflectToolCall`

Exact UI summary string: `Reflect`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters seen in generated protobuf:

| Name                         |     Type |
| ---------------------------- | -------: |
| `unexpected_action_outcomes` | `string` |
| `relevant_instructions`      | `string` |
| `scenario_analysis`          | `string` |
| `critical_synthesis`         | `string` |
| `next_steps`                 | `string` |
| `tool_call_id`               | `string` |

Observed result cases: `success`, `error`.

### `setupVmEnvironmentToolCall`

Exact UI summary string: `Setup VM Environment`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer.

### `replaceEnvToolCall`

Exact UI summary string: `Replace Environment`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer.

### `truncatedToolCall`

Exact UI summary string: `Truncated Tool Call`.

Literal description: `Not present as a literal description in the inspected bundle`.

Purpose: placeholder for a tool call whose details were truncated.

### `startGrindExecutionToolCall`

Exact UI summary string: `Start Grind Execution`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer.

### `startGrindPlanningToolCall`

Exact UI summary string: `Start Grind Planning`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer.

### `reportBugfixResultsToolCall`

Exact UI summary string: `Report Bugfix Results`.

Literal description: `Not present as a literal description in the inspected bundle`.

Input parameters: not recovered from the main summarizer.

## Task System

The task system is implemented as subagents. The main task tool is `taskToolCall`; the CLI subagent host adapter is in `2556.index.js` under `./src/subagent/cli-subagent-host-adapter.ts`.

### Session Creation And Resume

The adapter method `createOrResumeSession` handles session setup.

Observed behavior:

- `forkAgentId` is explicitly rejected with the exact error text `forkAgentId is not supported in agent-cli subagents.`
- `resumeAgentId` must be a UUID-like string.
- If `resumeAgentId` is present without a prompt, the adapter returns that ID directly.
- If `resumeAgentId` points to an existing session, that session is reused.
- Otherwise a new UUID is generated.
- A child agent store and transcript writer are created.
- Parent/child links are registered with `parentConversationId` and `toolCallId`.

Tracked maps:

| Name                     | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `sessions`               | Active subagent sessions.                                       |
| `backgroundRuns`         | Background subagent promises by agent ID.                       |
| `backgroundPromises`     | All active background promises.                                 |
| `pendingReleaseSessions` | Sessions waiting for background work before cleanup.            |
| `childParentIds`         | Child agent ID to parent agent ID.                              |
| `parentChildIds`         | Parent agent ID to child IDs.                                   |
| `queuedChildCompletions` | Completed child results waiting for a parent continuation loop. |
| `childCompletionWaiters` | Waiters for child completion collection.                        |

### Running A Task

The adapter method `runSession` handles execution.

Observed branches:

1. Await mode: if the request is an await-background mode, it calls `awaitBackgroundRun(resumeAgentId, signal)`.
2. Missing session: returns `{ status: "error", error: "Subagent session not found: ${id}" }`.
3. Background mode: if `runInBackground` is true, it starts the subagent and immediately returns:

```json
{
  "status": "background",
  "backgroundReason": "agent_request",
  "toolCallCount": 0
}
```

4. Foreground mode: it awaits `executeSubagent(...)` and then calls the session completion callback.

### Background Completion

When a background subagent finishes:

- The lifecycle run is marked finished.
- The background run entry is removed if it is still the current run.
- The result is queued as a child completion.
- Released sessions are cleaned up if no background work remains.
- `onSessionCompleted` is called.

### Status Mapping

The UI/session store maps subagent outcomes as follows:

| Subagent status | UI status   | Extra fields                                      |
| --------------- | ----------- | ------------------------------------------------- |
| `completed`     | `success`   | `lastMessage: finalMessage`                       |
| `error`         | `error`     | `lastMessage: error`                              |
| `aborted`       | `cancelled` | `lastMessage: error`                              |
| `background`    | `success`   | `isBackground: true`, `lastMessage: finalMessage` |

### Queued Prompts From Subagents

Subagents can enqueue prompts through `subagent-prompt-handler.ts`:

| Prompt type    | Fields                                                             |
| -------------- | ------------------------------------------------------------------ |
| `switch-mode`  | `queryId`, `toolCallId`, `args`, `decisionIndex`, `resolve`        |
| `ask-question` | `queryId`, `toolCallId`, `args`, `isAsync`, `selection`, `resolve` |
| `web-search`   | `args`, `resolve`                                                  |
| `web-fetch`    | `args`, `resolve`                                                  |

Async ask-question behavior:

- If `args.runAsync` is true, the prompt is enqueued and the handler immediately returns an async result.
- If `args.runAsync` is false, the handler returns a promise that resolves when the user answers or dismisses the prompt.

Session prompt ordering ranks queued prompt types in this order:

1. `web-fetch`
2. `web-search`
3. `switch-mode`
4. synchronous `ask-question`
5. async `ask-question`

### Continuation Mode

The adapter supports `continuationConfig`.

Observed behavior:

- `maxLoops > 0` sets a finite loop limit; otherwise the loop limit is effectively infinite.
- If `collectBackgroundChildren` is enabled, completed child results are collected and passed back into continuation loops.
- The collection loop has a hard cap of 500 collection attempts in the inspected code.

## Description Provenance

The bundle contains exact short UI summary strings, such as `Read File`, `Edit File`, `Create Plan`, `Record Screen`, and `Task: ${description}`. It does not contain a complete literal tool-description catalog with per-parameter prose descriptions in the inspected files. For that reason, this document does not invent word-for-word descriptions that were not present in the bundle.
