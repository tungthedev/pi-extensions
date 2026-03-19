import assert from "node:assert/strict";
import test from "node:test";

import { isFailedBashResult } from "./bash.ts";

test("isFailedBashResult treats nonzero exit codes as failures", () => {
  assert.equal(
    isFailedBashResult({
      content: [{ type: "text", text: "line 1\nexit code: 1" }],
    } as any),
    true,
  );

  assert.equal(
    isFailedBashResult({
      content: [{ type: "text", text: "line 1\nexit code: 0" }],
    } as any),
    false,
  );
});
