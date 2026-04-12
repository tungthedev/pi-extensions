import assert from "node:assert/strict";
import test from "node:test";

import { resolvePostPromptDurableStatus } from "./state.ts";

test("resolvePostPromptDurableStatus keeps a just-prompted child running when get_state is still idle", () => {
  assert.equal(
    resolvePostPromptDurableStatus({
      currentStatus: "live_running",
      state: { isStreaming: false, pendingMessageCount: 0 },
    }),
    "live_running",
  );
});

test("resolvePostPromptDurableStatus preserves an already observed completed state", () => {
  assert.equal(
    resolvePostPromptDurableStatus({
      currentStatus: "live_idle",
      state: { isStreaming: false, pendingMessageCount: 0 },
    }),
    "live_idle",
  );
});

test("resolvePostPromptDurableStatus keeps a running state when get_state reports pending work", () => {
  assert.equal(
    resolvePostPromptDurableStatus({
      currentStatus: "live_running",
      state: { isStreaming: false, pendingMessageCount: 1 },
    }),
    "live_running",
  );
});
