import assert from "node:assert/strict";
import test from "node:test";

import { seekSequence } from "./matching.ts";

test("seekSequence matches exact, trimmed, and unicode-normalized lines", () => {
  assert.equal(seekSequence(["foo", "bar", "baz"], ["bar", "baz"], 0, false), 1);
  assert.equal(seekSequence(["foo   ", "bar\t"], ["foo", "bar"], 0, false), 0);
  assert.equal(seekSequence(["    foo   ", "   bar\t"], ["foo", "bar"], 0, false), 0);
  assert.equal(
    seekSequence(
      ["import asyncio  # local import – avoids top‑level dep"],
      ["import asyncio  # local import - avoids top-level dep"],
      0,
      false,
    ),
    0,
  );
  assert.equal(seekSequence(["just one line"], ["too", "many", "lines"], 0, false), undefined);
});
