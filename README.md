# @tungthedev/pi-extensions

A collection of Pi packages:

- `ext-manager` — An in-app extension manager. Trigger with `/extmgr`
- `editor` — Replaces Pi's default editor with a boxed composer and an extensible status row.
- `mermaid` — Renders Mermaid code blocks inline in chat and opens a full diagram viewer on demand.
- `read` — Adds a standalone `read_file` tool with Pi-native read behavior and compact Codex-style call rendering.
- `web-search` — Adds Gemini-backed `web_search` and `web_extract` tools for grounded web research.
- `cloudflare-crawl` — Adds a Cloudflare Browser Rendering-backed `crawl_page` tool for actual page content fetching with foreground wait or background notification modes.
- `codex-content` — Overrides default tools with Codex-style compatibility tools and TUI rendering.
- `prompt-pack` — Selects and injects the configured system prompt pack for this package.
- `forge-content` — Adds Forge modes, resources, workflow helpers, and prompt-building support.
- `settings` — Adds the `/tungthedev` package settings command and package-scoped config UI.
- `subagents` — Adds persistent subagent tools for spawning, resuming, messaging, and waiting on child agents.

## Compatibility

`@tungthedev/pi-extensions@1.0.0` targets Pi `0.62.0` and newer.

- Use `@tungthedev/pi-extensions@0.3.1` with older Pi releases `<0.62.0`.

## Env Setup

Some extensions need provider credentials in your shell environment before starting Pi.

- `web-search` requires `GEMINI_API_KEY`.
- `cloudflare-crawl` requires `CLOUDFLARE_ACCOUNT_ID` and either `CLOUDFLARE_BROWSER_RENDERING_API_TOKEN` or `CLOUDFLARE_API_TOKEN`.

If the required Gemini env var is missing, `web_search` and `web_extract` are automatically removed from the active tool list so the model will not see or call them.

If the required Cloudflare env vars are missing, the `crawl_page` tool is automatically removed from the active tool list so the model will not see or call it.

Example:

```bash
export GEMINI_API_KEY=your-gemini-key
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_BROWSER_RENDERING_API_TOKEN=your-browser-rendering-token
pi
```

## Install

From npm (after publishing):

```bash
pi install npm:@tungthedev/pi-extensions
```

For older Pi versions:

```bash
pi install npm:@tungthedev/pi-extensions@0.3.1
```

Or from a local checkout:

```bash
pi install /absolute/path/to/pi-extensions
# or
pi install ./pi-extensions
```

From another project, add the package to `.pi/settings.json`:

```json
{
  "packages": ["/absolute/path/to/pi-extensions"]
}
```

## Development

Install dependencies and run checks:

```bash
bun install
bun run check
bun run test
bun run lint
bun run typecheck
```
