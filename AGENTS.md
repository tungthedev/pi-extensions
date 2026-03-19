# AGENTS.md

This repo contains a set of extensions for Pi coding agent under `extensions`

## Testing Guidelines

- Keep tests that protect real behavior: user-visible flows, integration boundaries, security checks, runtime contracts, regressions, and failure handling.
- Remove tests that mostly restate static values, default config, env-to-object mapping, string templates, help text, or tiny parsing/trim helpers.
- Do not add tests for behavior already enforced well by `typecheck` or `build`.
- When a test file mixes high-value and low-value coverage, trim the weak cases instead of deleting the whole file.
- Prefer a small number of representative contract or integration tests over many repetitive endpoint or option assertions.
- Prefer tests that would catch a bug a teammate could realistically ship. If `typecheck`/`build` would already catch it, the test is usually low value.
- Avoid pinning implementation details unless they guard a known regression or a meaningful compatibility contract.
- Keep test suites lean, readable, and cheap to maintain.

## Test Review Heuristic

Before keeping or adding a test, ask:

1. Does this protect meaningful runtime behavior?
2. Would a regression here hurt users, safety, or integration stability?
3. Would `typecheck` or `build` already catch this?
4. Is this just checking a static config/env/default value?

If the answer to 1 or 2 is no, or the answer to 3 or 4 is yes, the test is probably not worth keeping.
