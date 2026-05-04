# Changelog

All notable changes to `@tungthedev/pi-extensions` will be documented in this file.

## [Unreleased]

## [2.3.0] - 2026-05-04

### Added

- Added fixed editor mode.

### Changed

- Improve `/pi-mode` settings UI.
- Updated Pi development dependencies to `0.72.1`.

### Fixed

- Preserved expanded `read` error output inside the self-rendered Pi read shell when the native result component is empty.
- Used Pi's model-aware thinking-level clamp for OpenAI Responses streams so unsupported `xhigh` reasoning falls back to `high`.

## [2.2.0] - 2026-04-27

### Added

- Added OpenAI Responses image-generation support for Codex, including response parsing, streaming handling, image rendering, and the bundled `openai-responses-image-patch` extension.

### Changed

- Updated shared file-search, directory-listing, todo-plan, skill, and tool-renderer behavior to support the new image-generation response flow.

## [2.1.0] - 2026-04-24

### Added

- Added stacked editor autocomplete support for Pi `0.70`, including subagent role suggestions alongside the existing skill and `@path` completions.

### Changed

- Updated prompt customization flows to use Pi `0.70` structured system-prompt metadata, improving how `SYSTEM.md`, Codex, Droid, and Load Skills behavior follow the active session context.

### Fixed

- Fixed the Cloudflare-backed `FetchUrl` tool so it no longer sends an invalid crawl `depth: 0` option that caused Browser Rendering requests to fail validation.

## [2.0.3] - 2026-04-21

### Changed

- Added aligned line-numbered `read` output to agent-facing text responses across the shared Pi, Codex, and Droid read surface.

## [2.0.2] - 2026-04-20

### Added

- Added a session-only `Load Skills` toggle so you can enable or disable skill-list prompt injection for the current session without changing saved settings.
- Added `ctrl+alt+k` shortcut for toggling `Load Skills` in the current session.

### Changed

- Updated the Pi mode settings flow so `Load Skills` changes can be applied at the session level.
- Updated the mode-cycle shortcut in the README to `ctrl+alt+m`.

### Fixed

- Render the editor border legend tool-set label with bold styling and keep top-border width calculations stable when ANSI styling increases the raw string length.

## [2.0.0] - 2026-04-16

### Breaking Changes

- Raised the supported Pi baseline to `0.65.0`.
- Removed Forge mode.
- Codex/TOML-managed custom subagent roles are no longer loaded at runtime. Legacy Codex and `~/.pi/agent/agents` role paths now emit migration warnings instead.

### Added

- Added Droid mode with Droid-style tools, prompts, and web-search support.
- Added session-scoped Pi mode settings and the `/pi-mode` settings UI for switching tool sets and prompt options.
- Added settings-backed web tool secrets for Gemini, Cloudflare, and Firecrawl.
- Added a shared FFF backend behind the Pi, Codex, and Droid file-search surfaces, plus `/fff-status` and `/fff-reindex`.
- Added interactive subagent sessions, progress notifications, and a markdown-backed role manager for `/subagents`.

### Changed

- Replaced the old read extension path with `pi-custom` so Pi-native file tools can participate in shared tool-set resolution.
- Redesigned the editor context bar and aligned autocomplete behavior with shared skill and `@path` discovery.
- Updated web tool rendering and provider handling across the bundled mode surfaces.
- Renamed the `codex-subagents` extension surface to `subagents` in the package manifest and README while keeping the existing subagent tool contracts.

### Fixed

- Correctly parse Codex `models_cache.json` catalogs, including cache metadata fields and the shared `models` array format.
- Preserved interactive subagent tool access when launching interactive child sessions.
- Kept shortcut-driven mode changes session-scoped instead of leaking into saved settings.
- Hardened subagent task runtime behavior and provider-tool availability checks when credentials are missing.

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
