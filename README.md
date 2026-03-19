# @tungnguyensipher/pi-extensions

A Pi package repo that bundles seven extensions from this repository:

- `editor` — Replaces Pi's default editor with a boxed composer and an extensible status row.
- `mermaid` — Renders Mermaid code blocks inline in chat and opens a full diagram viewer on demand.
- `web-search` — Adds Gemini-backed `web_search` and `web_fetch` tools for grounded web research. (Requires `GEMINI_API_KEY` env when start pi)
- `codex-content` — Overrides default tools with Codex-style compatibility tools and TUI rendering.
- `codex-system-prompt` — Injects Codex-specific system prompt and collaboration mode instructions before agent start.
- `codex-subagents` — Adds Codex-style subagent tools for spawning, resuming, messaging, and waiting on child agents.
- `ext-manager` — Adds an in-app extension manager for browsing and managing local and package-provided extensions. Trigger with `/extmgr`

## Install

From npm (after publishing):

```bash
pi install npm:@tungnguyensipher/pi-extensions
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
