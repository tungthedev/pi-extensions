import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import test from "node:test";

import { createInteractiveContext } from "./interactive/context.ts";
import { createTmuxSurfaceSplit, submitTmuxInput } from "./interactive/backends/tmux.ts";
import { createWezTermSurfaceSplit } from "./interactive/backends/wezterm.ts";
import {
  consumeInteractiveExitSignal,
  consumeInteractiveUpdateSignals,
  getMuxBackend,
} from "./interactive.ts";

test("getMuxBackend respects context-scoped command detection without leaking between invocations", () => {
  const firstContext = createInteractiveContext({
    env: { PI_SUBAGENT_MUX: "tmux", TMUX: "1" },
    hasCommand: (command) => command === "tmux",
  });
  const secondContext = createInteractiveContext({
    env: { PI_SUBAGENT_MUX: "tmux", TMUX: "1" },
    hasCommand: () => false,
  });

  assert.equal(getMuxBackend(firstContext), "tmux");
  assert.equal(getMuxBackend(secondContext), null);
});

test("consumeInteractiveExitSignal returns done markers exactly once", () => {
  const root = process.env.TEST_TMPDIR ?? "/tmp";
  const sessionFile = `${root}/interactive-exit-${Date.now().toString(36)}.jsonl`;

  try {
    writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }), "utf8");
    assert.deepEqual(consumeInteractiveExitSignal(sessionFile), { type: "done" });
    assert.equal(consumeInteractiveExitSignal(sessionFile), null);
  } finally {
    rmSync(`${sessionFile}.exit`, { force: true });
  }
});

test("consumeInteractiveExitSignal returns ping markers exactly once", () => {
  const root = process.env.TEST_TMPDIR ?? "/tmp";
  const sessionFile = `${root}/interactive-ping-${Date.now().toString(36)}.jsonl`;

  try {
    writeFileSync(
      `${sessionFile}.exit`,
      JSON.stringify({ type: "ping", name: "worker", message: "need help" }),
      "utf8",
    );
    assert.deepEqual(consumeInteractiveExitSignal(sessionFile), {
      type: "ping",
      name: "worker",
      message: "need help",
    });
    assert.equal(consumeInteractiveExitSignal(sessionFile), null);
  } finally {
    rmSync(`${sessionFile}.exit`, { force: true });
  }
});

test("consumeInteractiveUpdateSignals returns new update messages without replaying old ones", () => {
  const root = process.env.TEST_TMPDIR ?? "/tmp";
  const sessionFile = `${root}/interactive-update-${Date.now().toString(36)}.jsonl`;

  try {
    writeFileSync(
      `${sessionFile}.signals`,
      [
        JSON.stringify({ type: "update", message: "first update" }),
        JSON.stringify({ type: "update", message: "second update" }),
      ].join("\n") + "\n",
      "utf8",
    );

    const firstRead = consumeInteractiveUpdateSignals(sessionFile, 0);
    assert.deepEqual(firstRead.messages, ["first update", "second update"]);

    const secondRead = consumeInteractiveUpdateSignals(sessionFile, firstRead.nextOffset);
    assert.deepEqual(secondRead.messages, []);
  } finally {
    rmSync(`${sessionFile}.signals`, { force: true });
  }
});

test("consumeInteractiveUpdateSignals only returns appended update bytes on later reads", () => {
  const root = process.env.TEST_TMPDIR ?? "/tmp";
  const sessionFile = `${root}/interactive-update-append-${Date.now().toString(36)}.jsonl`;

  try {
    writeFileSync(
      `${sessionFile}.signals`,
      `${JSON.stringify({ type: "update", message: "first update" })}\n`,
      "utf8",
    );

    const firstRead = consumeInteractiveUpdateSignals(sessionFile, 0);
    assert.deepEqual(firstRead.messages, ["first update"]);

    writeFileSync(
      `${sessionFile}.signals`,
      [
        JSON.stringify({ type: "update", message: "first update" }),
        JSON.stringify({ type: "update", message: "appended update" }),
      ].join("\n") + "\n",
      "utf8",
    );

    const secondRead = consumeInteractiveUpdateSignals(sessionFile, firstRead.nextOffset);
    assert.deepEqual(secondRead.messages, ["appended update"]);

    const thirdRead = consumeInteractiveUpdateSignals(sessionFile, secondRead.nextOffset);
    assert.deepEqual(thirdRead.messages, []);
  } finally {
    rmSync(`${sessionFile}.signals`, { force: true });
  }
});

test("wrapInteractiveSpawnPrompt no longer references subagent_done", async () => {
  const { wrapInteractiveSpawnPrompt } = await import("./request-utils.ts");
  const prompt = wrapInteractiveSpawnPrompt("finish the task");

  assert.equal(prompt.includes("subagent_done"), false);
  assert.match(prompt, /caller_ping/);
  assert.match(prompt, /caller_update/);
});

test("backend adapters build stable tmux and wezterm command invocations", () => {
  const tmuxCalls: string[][] = [];
  const weztermCalls: string[][] = [];

  const tmuxContext = createInteractiveContext({
    execFileSync: ((_file: string, args: string[]) => {
      tmuxCalls.push(args as string[]);
      return args.includes("-F") ? "%12\n" : "";
    }) as never,
  });
  const weztermContext = createInteractiveContext({
    cwd: () => "/tmp/project",
    execFileSync: ((_file: string, args: string[]) => {
      weztermCalls.push(args as string[]);
      return args[1] === "split-pane" ? "42\n" : "";
    }) as never,
  });

  const tmuxPane = createTmuxSurfaceSplit(tmuxContext, "review", "left", "%5");
  submitTmuxInput(tmuxContext, tmuxPane);
  const weztermPane = createWezTermSurfaceSplit(weztermContext, "review", "down", "7");

  assert.equal(tmuxPane, "%12");
  assert.deepEqual(tmuxCalls[0], ["split-window", "-h", "-b", "-t", "%5", "-P", "-F", "#{pane_id}"]);
  assert.deepEqual(tmuxCalls[1], ["select-pane", "-t", "%12", "-T", "review"]);
  assert.deepEqual(tmuxCalls[2], ["send-keys", "-t", "%12", "Enter"]);

  assert.equal(weztermPane, "42");
  assert.deepEqual(weztermCalls[0], ["cli", "split-pane", "--bottom", "--cwd", "/tmp/project", "--pane-id", "7"]);
  assert.deepEqual(weztermCalls[1], ["cli", "set-tab-title", "--pane-id", "42", "review"]);
});
