import { test } from "bun:test";
import assert from "node:assert/strict";

import extensionManager from "./index.ts";

test("extmgr command returns early without touching ctx.ui when UI is unavailable", async () => {
  let commandHandler: ((args: string[], ctx: Record<string, unknown>) => Promise<void>) | undefined;

  extensionManager({
    registerShortcut() {
      // no-op
    },
    registerCommand(
      _name: string,
      command: { handler: (args: string[], ctx: Record<string, unknown>) => Promise<void> },
    ) {
      commandHandler = command.handler as typeof commandHandler;
    },
  } as never);

  let uiAccessed = false;
  const ctx = {
    hasUI: false,
    ui: new Proxy(
      {},
      {
        get() {
          uiAccessed = true;
          throw new Error("ctx.ui should not be accessed");
        },
      },
    ),
  };

  assert.ok(commandHandler);
  await commandHandler([], ctx as never);
  assert.equal(uiAccessed, false);
});
