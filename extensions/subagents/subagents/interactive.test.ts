import assert from "node:assert/strict";
import test from "node:test";

import { createInteractiveContext } from "./interactive/context.ts";
import { createTmuxSurfaceSplit, submitTmuxInput } from "./interactive/backends/tmux.ts";
import { createWezTermSurfaceSplit } from "./interactive/backends/wezterm.ts";
import { getMuxBackend } from "./interactive.ts";

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
