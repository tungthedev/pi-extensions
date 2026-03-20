# @tungthedev/pi-extensions

A Pi package repo that bundles eight extensions from this repository:

- `editor` — Replaces Pi's default editor with a boxed composer and an extensible status row.
- `mermaid` — Renders Mermaid code blocks inline in chat and opens a full diagram viewer on demand.
- `web-search` — Adds Gemini-backed `web_search` and `web_extract` tools for grounded web research.
- `cloudflare-crawl` — Adds a Cloudflare Browser Rendering-backed `crawl_page` tool for actual page content fetching with foreground wait or background notification modes.
- `codex-content` — Overrides default tools with Codex-style compatibility tools and TUI rendering.
- `codex-system-prompt` — Injects Codex-specific system prompt and collaboration mode instructions before agent start.
- `codex-subagents` — Adds Codex-style subagent tools for spawning, resuming, messaging, and waiting on child agents.
- `ext-manager` — Adds an in-app extension manager for browsing and managing local and package-provided extensions. Trigger with `/extmgr`

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
