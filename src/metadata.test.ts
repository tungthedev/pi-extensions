import { expect, test } from "bun:test";

import { getPiExtensionsToolMetadata } from "./metadata.js";

test("aggregates requested module metadata", () => {
  const shellOnly = getPiExtensionsToolMetadata({ modules: ["shell"] });

  expect(shellOnly.map((tool) => tool.name)).toContain("shell");
  expect(shellOnly.every((tool) => tool.source === "shell")).toBe(true);
});

test("returns every module in the documented metadata registry by default", () => {
  const all = getPiExtensionsToolMetadata();

  expect(all.some((tool) => tool.source === "codex-content")).toBe(true);
  expect(all.some((tool) => tool.source === "subagents")).toBe(true);
});
