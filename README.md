# There are many Pi extensions, but this one is mine.

`@tungthedev/pi-extensions` is a bundled Pi package that upgrades the default Pi experience with a better editor, inline Mermaid rendering, web research tools, skill loading, workspace tooling, tool-set switching for Pi/Codex/Droid modes, and a TUI-first subagent manager.

The package currently ships these extensions:

- `editor` custom composer UI with cleaner status row
- `mermaid` for inline Mermaid rendering and a full diagram viewer
- `web` for `WebSearch`, `WebSummary`, and `FetchUrl`
- `skill` for loading local Pi skills with the `skill` tool
- `pi-modes` for Codex/Droid tool-set switching, prompts, and subagents
- `ext-manager` for managing extensions from inside Pi

## Install

From npm:

```bash
pi install npm:@tungthedev/pi-extensions
```

From git:

```bash
pi install https://github.com/tungthedev/pi-extensions
```

## What You Get

### Editor

The `editor` extension replaces Pi's default composer with a boxed editor UI and an extensible status row. It also integrates with the package's file and skill discovery features so autocomplete can stay consistent across modes.

### Mermaid

The `mermaid` extension detects Mermaid code blocks in chat, renders them inline, and keeps a session diagram index you can browse later.

- Shortcut: `ctrl+shift+m`
- Command: `/mermaid`

### Better `grep` and `find`

The `workspace` extension extends Pi-native file tools and routing discovery-heavy operations through the shared FFF backend. FFF improves fuzzy path resolution, repository discovery, and editor `@path` autocomplete

Commands:

- `/fff-status` shows the current FFF index state and storage paths for the session
- `/fff-reindex` triggers a rebuild of the current session index

### Web Research

The `web` extension registers three tools:

- `WebSearch` for web discovery and current documentation lookup
- `WebSummary` for grounded summaries of a specific URL using Gemini URL Context
- `FetchUrl` for scraping user-provided URLs into markdown via a configured fetch provider

Web tools become available when provider credentials are available.

You can use enviromnent variables:

```bash
export GEMINI_API_KEY=your-gemini-key # for WebSearch and WebSummary
export EXA_API_KEY=your-exa-key # for WebSearch
export CLOUDFLARE_ACCOUNT_ID=your-account-id # for FetchUrl
export CLOUDFLARE_API_TOKEN=your-browser-rendering-token # need browser rendering edit permission
export FIRECRAWL_API_KEY=your-firecrawl-key # for FetchUrl
pi
```

Or via `/pi-mode` > Web Tools config:

### Skills

The `skill` extension adds a global `skill` tool that resolves content from loaded Pi skills and returns the skill instructions directly to the agent.

### Pi Modes And Subagents

The `pi-modes` extension bundles several mode-specific surfaces:

- Pi/Codex/Droid tool-set switching
- Pi mode settings and prompt toggles
- Codex and Droid tools and system prompt
- Builtin subagents. You can also add yours.

Commands and shortcuts:

- `/pi-mode` opens the Pi mode settings UI or updates package settings
- `/subagents` opens the interactive subagent manager
- `ctrl+shift+t` cycles the active tool set between Pi, Codex, and Droid

### Extension Manager

The `ext-manager` extension provides an in-app extension manager UI.

- Command: `/extmgr`

### Themes

The package also ships bundled themes under `themes/`:

- `ayu-dark`
- `one-dark-pro`
- `dracula`

## Package Layout

- `extensions/` contains the Pi extension entrypoints declared in `package.json`
- `src/` contains the implementation for editor, web, workspace, FFF, modes, subagents, and shared utilities
- `themes/` contains bundled Pi themes

## License

MIT
