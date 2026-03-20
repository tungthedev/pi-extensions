# Changelog

All notable changes to `@tungthedev/pi-extensions` will be documented in this file.

## [0.2.0] - 2026-03-20

### Added

- Added model-aware Codex system prompts so prompt injection can adapt to the active model.
- Added a `list_skills` tool and renderer for discovering available Pi skills.
- Added a built-in `reviewer` subagent profile.
- Registered the `skill` extension in the package manifest.
- Added `find_files` to Codex exploration tracking.

### Changed

- Refactored `codex-content` for readability with clearer module boundaries, shared utilities, simpler renderers, and split test suites.
- Aligned `wait_agent` behavior more closely with Codex semantics.
- Simplified Codex prompt assets by removing the default collaboration mode prompt and other unused prompt assets.

### Fixed

- Fixed extension manager package view updates.
- Fixed Codex exploration widget persistence.

## [0.1.0] - 2026-03-19

Initial release.

### Added

- `editor` extension with a boxed composer UI and extensible status row.
- `mermaid` extension for inline Mermaid rendering and an interactive diagram viewer.
- `web-search` extension with Gemini-backed `web_search` and `web_fetch` tools.
- `codex-content` extension with Codex-style compatibility tools, workflow helpers, and exploration UI.
- `codex-system-prompt` extension to inject Codex-oriented system prompt and collaboration mode instructions.
- `codex-subagents` extension with Codex-style subagent tools to spawn, resume, message, and wait on child agents.
- `ext-manager` extension with an in-app UI for managing local and package-provided extensions.
