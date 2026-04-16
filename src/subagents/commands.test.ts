import assert from "node:assert/strict";
import test from "node:test";

import { registerSubagentsCommand } from "./commands.ts";

function captureSubagentsCommand() {
  let registered:
    | { description?: string; handler: (args: string | string[], ctx: any) => Promise<void> | void }
    | undefined;

  const messages: string[] = [];
  const pi = {
    registerCommand(_name: string, command: { description?: string; handler: (args: string | string[], ctx: any) => Promise<void> | void }) {
      registered = command;
    },
    sendMessage(message: { content?: string }) {
      messages.push(String(message.content ?? ""));
    },
  } as never;

  registerSubagentsCommand(pi);

  assert.ok(registered);
  return { command: registered!, messages };
}

test("/subagents opens a custom overlay when UI is available", async () => {
  const { command, messages } = captureSubagentsCommand();
  let customCalls = 0;

  await command.handler("", {
    hasUI: true,
    cwd: "/tmp/project",
    ui: {
      custom() {
        customCalls += 1;
        return Promise.resolve(undefined);
      },
      notify() {},
    },
    modelRegistry: {
      getAvailable() {
        return [];
      },
    },
  });

  assert.equal(customCalls, 1);
  assert.deepEqual(messages, []);
});

test("/subagents returns a helpful message when UI is unavailable", async () => {
  const { command, messages } = captureSubagentsCommand();

  await command.handler("", {
    hasUI: false,
    cwd: "/tmp/project",
    ui: {
      notify() {},
    },
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0] ?? "", /requires the interactive UI/i);
});
