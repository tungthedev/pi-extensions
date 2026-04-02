---
name: forge-review
description: Review workflow for finding correctness problems, regressions, edge cases, and missing verification in code changes. Use when the task is code review or risk assessment.
---

# Forge Review

## Workflow

1. Identify the changed or relevant files.
2. Understand the intended behavior.
3. Look for correctness problems first, then regressions, then missing tests.
4. Present findings in priority order with specific file references.

## Guidance

- Focus on actionable issues, not style nits.
- Call out residual risk if the change appears sound.
- Mention test gaps when runtime behavior is not adequately protected.
