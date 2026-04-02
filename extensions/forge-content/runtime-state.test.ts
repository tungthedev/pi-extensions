import assert from "node:assert/strict";
import test from "node:test";

import {
  createForgeRuntimeState,
  getActiveToolInfos,
  getForgeRuntimeSnapshot,
  setForgeRuntimeMode,
} from "./runtime-state.ts";

test("shared forge runtime snapshot reflects the latest selected mode", () => {
  const state = createForgeRuntimeState();

  setForgeRuntimeMode(state, "muse");

  assert.equal(getForgeRuntimeSnapshot(state).mode, "muse");
});

test("getActiveToolInfos returns only currently active tools", () => {
  const activeTools = getActiveToolInfos({
    getActiveTools: () => ["shell", "followup"],
    getAllTools: () => [
      { name: "shell", description: "Executes shell commands." },
      { name: "read", description: "Reads files." },
      { name: "followup", description: "Ask a focused question." },
    ],
  } as never);

  assert.deepEqual(activeTools, [
    { name: "shell", description: "Executes shell commands." },
    { name: "followup", description: "Ask a focused question." },
  ]);
});
