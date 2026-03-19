# @tungnguyensipher/pi-extensions

A Pi package repo that bundles five extensions from this repository:

- `editor`
- `codex-content`
- `codex-system-prompt`
- `codex-subagents`
- `ext-manager`

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

## Contents

This package exposes these extension entrypoints:

- `extensions/editor/index.ts`
- `extensions/codex-system-prompt/index.ts`
- `extensions/codex-content/index.ts`
- `extensions/codex-subagents/index.ts`
- `extensions/ext-manager/index.ts`

## Development

Install dependencies and run checks:

```bash
bun install
bun run check
bun run test
bun run lint
bun run typecheck
```

Useful repo files:

- `package.json` — Pi package manifest and Bun scripts
- `tsconfig.json` — editor/type-checking config for the TypeScript sources
- `.github/workflows/ci.yml` — CI for install, test, and lint
- `CHANGELOG.md` — release notes
- `LICENSE` — MIT license
