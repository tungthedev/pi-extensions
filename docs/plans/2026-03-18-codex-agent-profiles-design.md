# Codex Agent Profiles Design

Date: 2026-03-18

## Goal

Make `extensions/codex-content/` feel and behave more like upstream Codex by adding:

- Codex-style built-in agent profiles
- loading of custom Codex-format agent roles from Codex config
- real `agent_type` behavior during `spawn_agent`
- transcript and tool-description improvements that expose the selected profile clearly

This document is a design artifact only. It does not start implementation by itself.

---

## Problem summary

Today, `extensions/codex-content/` already exposes Codex-shaped subagent lifecycle tools, but `agent_type` is mostly cosmetic.

Current behavior:

- `spawn_agent` accepts `agent_type` in `extensions/codex-content/subagents/index.ts`
- the child process is spawned in `extensions/codex-content/subagents/attachment.ts`
- the child receives model/session bootstrap information only
- the selected `agent_type` is not used to inject role-specific developer instructions
- the selected `agent_type` is not used to load role-specific config defaults or locks
- tool descriptions do not advertise available roles like Codex does

Upstream Codex behaves differently:

- omitted `agent_type` defaults to `default`
- built-in roles are resolved and described to the model
- spawn-time role selection changes the child configuration
- user-defined roles can be loaded from Codex config and `agents/` role files
- role metadata includes `description`, `config_file`, and `nickname_candidates`

---

## Desired outcome

After this work:

- `spawn_agent` in Pi uses `agent_type` as a real profile selector, not a hint
- Pi exposes built-in Codex-like profiles:
  - `default`
  - `explorer`
  - `worker`
- Pi can load custom roles from Codex config format under `~/.codex/config.toml` or `CODEX_HOME/config.toml`
- Pi can discover Codex role files under the Codex config directory's `agents/` folder
- role metadata is visible in the `spawn_agent` schema description, similar to Codex
- spawned subagents store and render the selected profile/role
- role-specific developer instructions are injected into the child's system prompt before the child agent starts
- role-specific model and reasoning settings behave like Codex: role settings may lock or override child defaults

---

## Non-goals for v1

- full reimplementation of Codex's entire Rust config loader stack
- byte-for-byte compatibility with every Codex config key
- immediate support for every hidden or experimental upstream role
- exact replication of Codex TUI cells before the role system works end-to-end
- changing Pi's global configuration model outside `codex-content`

---

## Compatibility target

### Must match closely

- default role name: `default`
- built-in visible roles: `default`, `explorer`, `worker`
- custom role metadata format:
  - `[agents.<name>]`
  - `description`
  - `config_file`
  - `nickname_candidates`
- Codex role file format:
  - `name`
  - `description`
  - `nickname_candidates`
  - remaining keys treated as role config
- role discovery from Codex config directory `agents/`
- `spawn_agent` tool description should enumerate available roles
- unknown role errors should be explicit and model-visible

### Can be Pi-adapted

- exact config-layer precedence implementation
- exact random nickname selection algorithm
- full Codex `ConfigToml` parsing
- exact transcript phrasing for every renderer in v1

---

## High-level design

Introduce a small agent-profile subsystem inside `extensions/codex-content/`.

The subsystem has four responsibilities:

1. define built-in profiles bundled with the package
2. load user-defined Codex roles from Codex config files
3. merge built-ins and custom roles into a resolved registry
4. apply a selected role to child spawn behavior

The core idea is:

- resolve all available agent profiles in the parent process
- persist the chosen profile onto the durable child record
- pass the resolved profile payload to the child via environment/bootstrap
- have the child extension inject the role's developer instructions into the child system prompt during `before_agent_start`
- have the parent enforce role-derived model/reasoning settings during spawn

---

## Proposed file layout

Add the following modules under `extensions/codex-content/subagents/`:

```text
extensions/codex-content/subagents/
  profiles.ts
  profiles.test.ts
  profiles-types.ts
  profiles-builtins.ts
  profiles-loader.ts
  profiles-codex-config.ts
  profiles-apply.ts
```

And bundled assets:

```text
extensions/codex-content/assets/agents/
  explorer.toml
  worker.toml
  awaiter.toml
```

Notes:

- `awaiter.toml` may be packaged for future parity, but should not be exposed by default in v1 unless explicitly enabled
- `worker.toml` will be package-local because upstream `worker` currently has description metadata but no bundled role file
- keeping assets local ensures `codex-content` remains self-contained and does not depend on a sibling Codex checkout at runtime

---

## Data model

Add a new internal type family.

### `AgentProfileConfig`

Represents the effective profile Pi applies to a child.

Suggested shape:

```ts
type AgentProfileConfig = {
  name: string;
  description?: string;
  developerInstructions?: string;
  nicknameCandidates?: string[];
  model?: string;
  reasoningEffort?: string;
  lockedModel?: boolean;
  lockedReasoningEffort?: boolean;
  source: "builtin" | "codex-config" | "codex-agent-file";
  sourcePath?: string;
};
```

### `ResolvedAgentProfiles`

Represents the merged registry visible to `spawn_agent`.

```ts
type ResolvedAgentProfiles = {
  defaultRoleName: "default";
  profiles: Map<string, AgentProfileConfig>;
  warnings: string[];
};
```

### Durable record changes

Extend the current durable types in `extensions/codex-content/subagents/types.ts`:

- `DurableChildRecord`
  - add `agentType?: string`
- `AgentSnapshot`
  - add `agent_type?: string`

This lets the transcript show names like `amber-badger [explorer]` later.

---

## Built-in profiles

### `default`

- always available
- description: `Default agent.`
- no extra developer instructions
- no locked model or reasoning effort

### `explorer`

Visible and enabled by default.

Behavior goals:

- tuned for specific codebase questions
- injected developer instructions should mirror upstream role guidance closely
- if the bundled profile file sets `model` or `reasoning_effort`, those values are enforced during child spawn
- if the bundled profile file is later updated for parity, Pi should pick it up from the packaged asset without changing loader architecture

### `worker`

Visible and enabled by default.

Behavior goals:

- execution-oriented agent for bounded implementation work
- encourages explicit file/module ownership
- reminds worker agents they may not be alone in the codebase
- no locked model/reasoning unless the packaged role asset later adds them

### `awaiter`

Package the role asset and parser support, but do not expose it in the merged visible role list in v1.

Why:

- upstream currently keeps `awaiter` effectively hidden/commented out from the built-in visible list
- packaging it now avoids future design churn
- exposure can be gated later by a package-local feature or explicit config

---

## Codex custom role loading

### Config source resolution

Resolve Codex config from the following priority order:

1. `PI_CODEX_CONFIG_PATH` if set
2. `CODEX_HOME/config.toml` if `CODEX_HOME` is set
3. `~/.codex/config.toml`

If no file exists:

- load built-ins only
- do not fail subagent support

### Supported Codex config shape

Read only the role-related subset needed for parity:

```toml
[agents.researcher]
description = "..."
config_file = "/path/or/relative/file.toml"
nickname_candidates = ["Ada", "Lin"]
```

The loader should also discover additional role files under:

```text
<codex-config-dir>/agents/*.toml
```

### Codex role file shape

Support the Codex role file subset:

```toml
name = "researcher"
description = "Research carefully"
nickname_candidates = ["Ada"]
developer_instructions = "..."
model = "gpt-5"
model_reasoning_effort = "high"
```

Parsing rules:

- `name`, `description`, `nickname_candidates` are metadata
- remaining keys are role config payload
- at minimum, extract:
  - `developer_instructions`
  - `model`
  - `model_reasoning_effort`
- unknown extra fields are ignored in v1 unless they conflict with parser assumptions

### Merge rules

Merge order should follow Codex-like intent, without reimplementing its full layer stack:

1. start with built-in profiles
2. apply roles declared in Codex config
3. apply discovered role files from `agents/`
4. if two roles resolve to the same final name, later sources win, but record a warning

Field merging:

- custom role overrides built-in role of the same name
- if a custom role defines `config_file`, metadata in the file supplements table metadata
- file metadata wins over empty table metadata
- missing metadata falls back to previous values

Error policy:

- malformed roles do not crash the extension
- they produce warnings and are skipped
- spawn should fail only when the user explicitly requests an unavailable role

---

## Applying profiles during spawn

### Current gap

Today `spawn_agent`:

- resolves prompt input
- may set thinking level by RPC
- starts the child and sends the user task prompt

It does not apply role-specific behavior.

### New spawn flow

When `spawn_agent` is called:

1. resolve all available profiles
2. resolve requested role name:
   - omitted or empty => `default`
3. look up the effective profile
4. compute effective child settings
5. persist `agentType` on the child record
6. spawn the child with profile bootstrap metadata
7. if the effective profile locks model or reasoning, apply those values regardless of user override
8. if the effective profile does not lock them, allow explicit spawn parameters to override profile defaults
9. send the delegated user task prompt

### Effective settings rules

Use the following precedence:

#### Model

1. locked profile model
2. explicit `spawn_agent.model`
3. profile default model
4. inherited child default

#### Reasoning effort

1. locked profile reasoning effort
2. explicit `spawn_agent.reasoning_effort`
3. profile default reasoning effort
4. inherited child default

### Unknown role behavior

If the selected role does not exist in the merged registry:

- return a model-visible error similar to Codex
- recommended message:
  - `unknown agent_type '<name>'`

If the role exists but its underlying config/asset could not be loaded:

- return a model-visible availability error
- recommended message:
  - `agent type is currently not available`

---

## Child bootstrap mechanism

### Why prompt injection is needed

Codex roles are more than labels. They change the child agent's instructions.

Pi already injects the packaged Codex prompt in `extensions/codex-content/prompt.ts` using the `before_agent_start` hook. Reuse that pattern for role-specific instructions.

### Proposed bootstrap payload

Pass a profile payload to the child process through environment variables at spawn time.

Suggested env vars:

- `PI_CODEX_AGENT_PROFILE_NAME`
- `PI_CODEX_AGENT_PROFILE_JSON`

Where `PI_CODEX_AGENT_PROFILE_JSON` contains a compact serialized subset:

```ts
{
  name,
  developerInstructions,
  model,
  reasoningEffort,
  source
}
```

### Child-side behavior

Extend `extensions/codex-content/prompt.ts` to:

1. read the base Codex prompt as today
2. detect child profile bootstrap env vars
3. append role-specific developer instructions after the base Codex prompt
4. avoid duplicate injection if already present

This keeps role instructions in the correct prompt layer and avoids polluting the delegated user task text.

### Why env bootstrap instead of prompt-prefix only

Prompt-prefixing the delegated task would work, but it would:

- mix developer instructions with task content
- make transcript rendering noisier
- make future profile locking/extensions harder

Environment bootstrap plus `before_agent_start` is closer to Codex's intent.

---

## Naming and nickname behavior

Current Pi naming uses deterministic adjective-noun generation.

New behavior:

1. explicit `name` still wins
2. if the selected profile defines `nicknameCandidates`, choose from that list deterministically using the current spawn seed
3. if no candidate is available or all are taken, fall back to the existing Pi generator

This preserves current stability while supporting Codex-style role-specific nicknames.

---

## Tool description parity

Update `spawn_agent` parameter description for `agent_type` so it advertises the merged role list at runtime, similar to Codex.

Target behavior:

- if no custom roles exist, list built-ins
- if custom roles exist, list them first, then built-ins not shadowed by custom roles
- descriptions should mention locked model/reasoning values when present

Suggested extracted helper:

```ts
buildSpawnAgentTypeDescription(resolvedProfiles: ResolvedAgentProfiles): string
```

Example shape:

```text
Optional type name for the new agent. If omitted, `default` is used.
Available roles:
explorer: {
Use `explorer` for specific codebase questions.
}
worker: {
Use for execution and production work.
}
researcher: {
Research carefully.
- This role's model is set to `gpt-5` and its reasoning effort is set to `high`. These settings cannot be changed.
}
```

---

## Transcript/rendering changes

To make Pi feel more like Codex, role identity should appear in subagent rendering.

### Record changes

- persist `agentType` in durable child records
- include `agent_type` in tool result details and snapshots

### Rendering changes

Adjust `getSubagentDisplayName()` behavior to support role badges later.

Recommended display rules:

1. if `name` and `agent_type` exist: `name [agent_type]`
2. if only `name` exists: `name`
3. if only `agent_type` exists: `[agent_type]`
4. otherwise: `agent_id`

This is optional for the first implementation slice, but strongly recommended for parity.

---

## Startup and caching strategy

Avoid reparsing Codex config on every render path.

Recommended strategy:

- lazy-load profiles on first `spawn_agent` call
- cache the merged result in memory for the parent session
- invalidate cache on:
  - `session_start`
  - `session_switch`
  - optional future manual refresh hook

This is enough for v1.

Future enhancement:

- file-watch Codex config and `agents/` directory

---

## Testing plan

Add focused tests under the new profile modules and existing subagent tests.

### Built-in profile tests

- resolves `default`, `explorer`, `worker`
- does not expose `awaiter` by default
- bundled assets parse into expected metadata

### Custom role loader tests

- loads `[agents.<name>]` table entries
- resolves `config_file` relative to Codex config directory
- discovers `agents/*.toml`
- merges metadata from config table and role file
- skips malformed roles with warnings
- custom role shadows built-in role of the same name

### Spawn behavior tests

- omitted `agent_type` resolves to `default`
- unknown `agent_type` fails with explicit error
- profile developer instructions are passed to the child bootstrap payload
- locked profile model overrides explicit spawn model
- locked profile reasoning overrides explicit spawn reasoning
- unlocked explicit spawn values override profile defaults
- durable child record stores `agentType`

### Tool description tests

- runtime description enumerates built-ins
- runtime description lists custom roles before built-ins
- locked model/reasoning notes are rendered correctly

### Rendering tests

- role badge is included in display name when present

---

## Implementation phases

### Phase 1 — profile core

- add profile types
- add bundled built-ins
- add merge helpers
- add tests

### Phase 2 — Codex config loading

- load config path from env/home
- parse role tables and `agents/` role files
- add warning collection
- add tests

### Phase 3 — spawn integration

- wire resolved profiles into `spawn_agent`
- persist `agentType`
- apply model/reasoning precedence rules
- pass profile bootstrap payload to child
- add tests

### Phase 4 — prompt injection and transcript polish

- inject role-specific developer instructions in `prompt.ts`
- update display name/renderers
- update `spawn_agent` tool description
- add tests

---

## Risks and mitigations

### Risk: partial Codex config parsing drifts from upstream

Mitigation:

- intentionally scope parsing to the role-related subset only
- document unsupported fields clearly
- structure the loader so more fields can be added later without rewrites

### Risk: child prompt duplication

Mitigation:

- keep injected role instructions in a tagged or exact-string dedupable block
- reuse the current prompt injection helper pattern

### Risk: model lock behavior surprises users

Mitigation:

- reflect locked settings in the `agent_type` description
- include role/model metadata in `spawn_agent` render output where practical

### Risk: too much new logic lands in `subagents/index.ts`

Mitigation:

- keep profile resolution and application in dedicated modules
- make `subagents/index.ts` orchestration-only

---

## Open questions

1. Should Pi expose `awaiter` immediately behind a feature flag, or keep it fully hidden until upstream Codex does?
2. Should we support a Pi-specific override path such as `PI_CODEX_CONFIG_PATH` in v1? This design says yes because it improves testability and local development.
3. Should role warnings surface only in tests/logs, or also appear in the UI/status area when a custom role fails to load?
4. Should we support only role metadata and prompt/model settings in v1, or also future Codex role config keys if they appear?

---

## Recommended first implementation slice

Build the smallest slice that changes real behavior:

1. add built-in profiles: `default`, `explorer`, `worker`
2. resolve omitted `agent_type` to `default`
3. inject role developer instructions into the child prompt
4. persist and render `agentType`
5. update `spawn_agent` role description

Then add Codex config loading in the next slice.

This yields a noticeable “feels like Codex” improvement quickly, while keeping custom-role loading isolated and testable.
