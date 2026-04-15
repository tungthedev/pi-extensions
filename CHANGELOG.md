# Changelog

All notable changes to `@tungthedev/pi-extensions` will be documented in this file.

## [Unreleased]

### Breaking Changes

- Raised the supported Pi baseline to `0.65.0`.
- `/subagents` is now a TUI-first role manager backed by markdown roles in `~/.agents` and the nearest project `.agents/` directory.
- Codex/TOML-managed custom subagent roles are no longer loaded at runtime. Legacy Codex and `~/.pi/agent/agents` role paths now emit migration warnings instead.

### Notes

- If you are using Pi `<0.65.0`, stay on `@tungthedev/pi-extensions@1.1.0`.

### Changed

- Integrated a shared FFF backend behind the existing Pi, Codex, and Droid file-search surfaces, keeping public tool names unchanged while improving fuzzy path resolution, discovery, and `@path` editor autocomplete.
- Added `/fff-status` and `/fff-reindex` operational commands for viewing FFF index progress and triggering reindexing.
- Updated `codex-system-prompt` to resolve prompts from the bundled catalog first, `PI_CODEX_MODEL_CATALOG_PATH` second, and `~/.codex/models_cache.json` third, before falling back to the `gpt-5.4` prompt for any unknown model.
- Renamed the `codex-subagents` extension surface to `subagents` in the package manifest and README while keeping the existing subagent tool contracts.
- Updated the built-in `explorer` role to use the Sage research prompt as its developer instructions.

### Fixed

- Correctly parse Codex `models_cache.json` catalogs, including cache metadata fields and the shared `models` array format.

## [1.1.0] - 2026-03-31

### Changed

- Simplified codex subagents: `spawn_agent` now waits for completion by default.

### Fixed

- Fixed duplicate codex subagents completion reports.

## [1.0.3] - 2026-03-26

### Added

- Added bundled `ayu-dark`, `one-dark-pro`, and `dracula` Pi themes under the package `themes/` directory.

### Changed

- Refined the bundled theme contrast for secondary text and tool output to improve readability in Codex-style tool renderers.

## [1.0.2] - 2026-03-26

### Fixed

- Moved the plan widget above the editor and automatically hide it once all plan items are completed.

### Added

- Added new widget for runner subagents

## [1.0.1] - 2026-03-26

### Fixed

- Improved Windows compatibility for `codex-content` shell and search tools.

## [1.0.0] - 2026-03-24

### Breaking Changes

- Raised the supported Pi baseline to `0.62.0`.

### Notes

- If you are using Pi `<0.62.0`, stay on `@tungthedev/pi-extensions@0.3.1`.

## [0.3.1] - 2026-03-24

### Fixed

- Fixed `codex-subagents` completion notifications during active parent turns by switching streaming delivery from follow-up to steering so finished child agents surface inline instead of waiting for the turn to end.

## [0.3.0] - 2026-03-20

### Added

- Added a `cloudflare-crawl` extension with a `crawl_page` tool for fetching real page content through Cloudflare Browser Rendering, with foreground polling or background completion notifications.

### Changed

- Renamed the Gemini URL tool from `web_fetch` to `web_extract`.
- Refined `web_search` and `web_extract` rendering with richer previews, expandable markdown output, clearer titles, and inline source lists.
- Automatically remove `web_search`, `web_extract`, and `crawl_page` from the active tool list when their required provider credentials are missing so the model cannot call unavailable tools.

### Fixed

- Fixed background completion notifications for `codex-subagents` and `cloudflare-crawl` so they trigger a parent turn when the parent is idle and queue as follow-ups while the parent is streaming.
- Expanded `.gitignore` coverage for local env files and common development artifacts to avoid accidental commits.

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
