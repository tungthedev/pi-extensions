import assert from "node:assert/strict";
import test from "node:test";

import { parseExitCode } from "./text.ts";

test("parseExitCode recognizes both legacy and builtin bash failure strings", () => {
  assert.equal(parseExitCode("exit code: 7"), 7);
  assert.equal(parseExitCode("Command exited with code 7"), 7);
  assert.equal(parseExitCode("no exit code here"), undefined);
});
