import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import interactiveChild, {
  shouldAutoExitOnAgentEnd,
  shouldMarkUserTookOver,
} from "./interactive-child.ts";

test("shouldMarkUserTookOver only flips after the agent starts", () => {
  assert.equal(shouldMarkUserTookOver(false), false);
  assert.equal(shouldMarkUserTookOver(true), true);
});

test("shouldAutoExitOnAgentEnd matches interactive subagent completion rules", () => {
  assert.equal(
    shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "stop" }]),
    true,
  );
  assert.equal(
    shouldAutoExitOnAgentEnd(true, [{ role: "assistant", stopReason: "stop" }]),
    false,
  );
  assert.equal(
    shouldAutoExitOnAgentEnd(false, [{ role: "assistant", stopReason: "aborted" }]),
    false,
  );
});

test("interactive child auto-exit ignores pre-start input, skips takeover cycle, and re-arms later", () => {
  const handlers = new Map<string, Function>();
  let shutdowns = 0;

  interactiveChild({
    on(event: string, handler: Function) {
      handlers.set(event, handler);
    },
    registerTool() {},
    registerShortcut() {},
    getAllTools: () => [],
  } as never);

  const agentEnd = handlers.get("agent_end");
  const agentStart = handlers.get("agent_start");
  const input = handlers.get("input");

  assert.equal(typeof agentEnd, "function");
  assert.equal(typeof agentStart, "function");
  assert.equal(typeof input, "function");

  const ctx = {
    shutdown() {
      shutdowns += 1;
    },
  };

  input?.();
  agentEnd?.({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
  assert.equal(shutdowns, 1);

  agentStart?.();
  input?.();
  agentEnd?.({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
  assert.equal(shutdowns, 1);

  agentEnd?.({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
  assert.equal(shutdowns, 2);

  agentStart?.();
  agentEnd?.({ messages: [{ role: "assistant", stopReason: "aborted" }] }, ctx);
  assert.equal(shutdowns, 2);

  agentEnd?.({ messages: [{ role: "assistant", stopReason: "stop" }] }, ctx);
  assert.equal(shutdowns, 3);
});

test("caller_ping writes a ping exit sidecar before shutdown", async () => {
  const tools = new Map<string, { execute: Function }>();
  const tempRoot = mkdtempSync(path.join(tmpdir(), "interactive-child-"));
  const sessionFile = path.join(tempRoot, "session.jsonl");
  writeFileSync(sessionFile, "", "utf8");
  const previousSession = process.env.PI_SUBAGENT_SESSION;
  const previousName = process.env.PI_SUBAGENT_NAME;
  process.env.PI_SUBAGENT_SESSION = sessionFile;
  process.env.PI_SUBAGENT_NAME = "worker";

  try {
    interactiveChild({
      on() {},
      registerTool(def: { name: string; execute: Function }) {
        tools.set(def.name, def);
      },
      registerShortcut() {},
      getAllTools: () => [],
    } as never);

    let shutdowns = 0;
    const tool = tools.get("caller_ping");
    assert.ok(tool);

    await tool.execute("call-1", { message: "need schema guidance" }, undefined, undefined, {
      shutdown() {
        shutdowns += 1;
      },
    });

    assert.equal(shutdowns, 1);
    assert.deepEqual(
      JSON.parse(readFileSync(`${sessionFile}.exit`, "utf8")),
      { type: "ping", name: "worker", message: "need schema guidance" },
    );
  } finally {
    if (previousSession === undefined) {
      delete process.env.PI_SUBAGENT_SESSION;
    } else {
      process.env.PI_SUBAGENT_SESSION = previousSession;
    }
    if (previousName === undefined) {
      delete process.env.PI_SUBAGENT_NAME;
    } else {
      process.env.PI_SUBAGENT_NAME = previousName;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("caller_update appends a non-exiting update signal", async () => {
  const tools = new Map<string, { execute: Function }>();
  const tempRoot = mkdtempSync(path.join(tmpdir(), "interactive-child-"));
  const sessionFile = path.join(tempRoot, "session.jsonl");
  writeFileSync(sessionFile, "", "utf8");
  const previousSession = process.env.PI_SUBAGENT_SESSION;
  process.env.PI_SUBAGENT_SESSION = sessionFile;

  try {
    interactiveChild({
      on() {},
      registerTool(def: { name: string; execute: Function }) {
        tools.set(def.name, def);
      },
      registerShortcut() {},
      getAllTools: () => [],
    } as never);

    let shutdowns = 0;
    const tool = tools.get("caller_update");
    assert.ok(tool);

    const result = await tool.execute("call-1", { message: "still auditing resume flow" }, undefined, undefined, {
      shutdown() {
        shutdowns += 1;
      },
    });

    assert.equal(shutdowns, 0);
    assert.match(String(result.content?.[0]?.text ?? ""), /Update sent/);
    assert.deepEqual(
      JSON.parse(readFileSync(`${sessionFile}.signals`, "utf8").trim()),
      { type: "update", message: "still auditing resume flow" },
    );
  } finally {
    if (previousSession === undefined) {
      delete process.env.PI_SUBAGENT_SESSION;
    } else {
      process.env.PI_SUBAGENT_SESSION = previousSession;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("interactive child registers caller_update and excludes subagent_done", () => {
  const tools = new Map<string, { execute: Function }>();

  interactiveChild({
    on() {},
    registerTool(def: { name: string; execute: Function }) {
      tools.set(def.name, def);
    },
    registerShortcut() {},
    getAllTools: () => [],
  } as never);

  assert.equal(tools.has("subagent_done"), false);
  assert.equal(tools.has("caller_ping"), true);
  assert.equal(tools.has("caller_update"), true);
});
