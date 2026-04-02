---
name: forge-research
description: Deep codebase investigation workflow for tracing architecture, following data flow, and mapping relevant files before implementation. Use when a task requires broad understanding before editing.
---

# Forge Research

## Workflow

1. Identify the part of the system relevant to the task.
2. Read the most central files first.
3. Use search tools to map related symbols, configuration, and tests.
4. Summarize the current behavior, risks, and likely edit points.

## Guidance

- Prefer reading larger coherent file sections over many tiny reads.
- Capture architectural findings before proposing changes.
- Distinguish clearly between verified facts and assumptions.
