import assert from "node:assert/strict";
import test from "node:test";

import { resolveFinalResultText } from "./final-result.ts";

test("resolveFinalResultText prefers completion event text", () => {
  assert.equal(
    resolveFinalResultText({ eventText: "done from agent_end", cachedText: "older text" }),
    "done from agent_end",
  );
});

test("resolveFinalResultText falls back to cached assistant text when completion event text is missing", () => {
  assert.equal(
    resolveFinalResultText({ eventText: undefined, cachedText: "done from message_end" }),
    "done from message_end",
  );
});

test("resolveFinalResultText returns undefined when no meaningful result text exists", () => {
  assert.equal(resolveFinalResultText({ eventText: "  ", cachedText: undefined }), undefined);
});
