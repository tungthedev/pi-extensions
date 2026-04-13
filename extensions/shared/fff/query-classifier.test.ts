import assert from "node:assert/strict";
import test from "node:test";

import {
  inferFffGrepMode,
  shouldUseFffForDiscovery,
  shouldUseLegacyCodexFind,
  shouldUseLegacyDroidGlob,
} from "./query-classifier.ts";

test("classifier routes fuzzy discovery queries to FFF and strict glob queries to legacy search", () => {
  assert.equal(shouldUseFffForDiscovery({ pattern: "readme editor" }), true);
  assert.equal(shouldUseLegacyCodexFind("**/*.ts"), true);
});

test("classifier keeps Droid Glob on the legacy path for multi-pattern and exclusion-heavy requests", () => {
  assert.equal(shouldUseLegacyDroidGlob({ patterns: ["src", "tests"] }), true);
  assert.equal(
    shouldUseLegacyDroidGlob({ patterns: "src", excludePatterns: "node_modules/**" }),
    true,
  );
  assert.equal(shouldUseLegacyDroidGlob({ patterns: "readme" }), false);
});

test("grep mode inference stays plain-first unless the pattern clearly looks like regex", () => {
  assert.equal(inferFffGrepMode({ pattern: "needle" }), "plain");
  assert.equal(inferFffGrepMode({ pattern: "foo.*bar" }), "regex");
});
