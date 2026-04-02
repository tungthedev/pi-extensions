import assert from "node:assert/strict";
import test from "node:test";

import { replaceAllOccurrences, replaceOnce } from "./patch.ts";

test("replaceOnce replaces a unique occurrence", () => {
  const result = replaceOnce("hello world", "world", "forge");
  assert.deepEqual(result, {
    text: "hello forge",
    replacements: 1,
  });
});

test("replaceOnce rejects non-unique matches", () => {
  assert.throws(() => replaceOnce("x x", "x", "y"), /not unique/);
});

test("replaceAllOccurrences replaces all matches and reports count", () => {
  const result = replaceAllOccurrences("a a a", "a", "b");
  assert.deepEqual(result, {
    text: "b b b",
    replacements: 3,
  });
});
