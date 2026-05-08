import { expect, test } from "bun:test";

import { pathToFileURL } from "node:url";

import { resolveSubagentRuntimeEntries } from "./types.js";

test("resolves source subagent runtime entries to TypeScript files", () => {
  const entries = resolveSubagentRuntimeEntries(
    pathToFileURL("/repo/src/subagents/subagents/types.ts").href,
  );

  expect(entries.extensionEntry).toBe("/repo/src/subagents/child-entry.ts");
  expect(entries.interactiveExtensionEntry).toBe("/repo/src/subagents/interactive-child-entry.ts");
  expect(entries.interactiveLauncherEntry).toBe("/repo/src/subagents/interactive-launcher.mjs");
});

test("resolves built subagent runtime entries to emitted JavaScript files", () => {
  const entries = resolveSubagentRuntimeEntries(
    pathToFileURL("/repo/dist/src/subagents/subagents/types.js").href,
  );

  expect(entries.extensionEntry).toBe("/repo/dist/src/subagents/child-entry.js");
  expect(entries.interactiveExtensionEntry).toBe(
    "/repo/dist/src/subagents/interactive-child-entry.js",
  );
  expect(entries.interactiveLauncherEntry).toBe(
    "/repo/dist/src/subagents/interactive-launcher.mjs",
  );
});
