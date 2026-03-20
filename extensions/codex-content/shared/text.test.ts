import assert from "node:assert/strict";
import test from "node:test";

import { parseExitCode, shortenText, summarizeList } from "./text.ts";

test("parseExitCode recognizes both legacy and builtin bash failure strings", () => {
  assert.equal(parseExitCode("exit code: 7"), 7);
  assert.equal(parseExitCode("Command exited with code 7"), 7);
  assert.equal(parseExitCode("no exit code here"), undefined);
});

test("shortenText truncates long strings and preserves short strings", () => {
  assert.equal(shortenText("short", 10), "short");
  assert.equal(shortenText("abcdefghijkl", 8), "abcde...");
  assert.equal(shortenText(undefined, 8, "fallback"), "fallback");
});

test("summarizeList keeps short lists intact and summarizes longer lists", () => {
  assert.equal(summarizeList(["a", "b"]), "a, b");
  assert.equal(summarizeList(["a", "b", "c"]), "a, b, +1 more");
});
