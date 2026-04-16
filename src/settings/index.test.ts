import { initTheme } from "@mariozechner/pi-coding-agent";
import assert from "node:assert/strict";
import test from "node:test";

import { handlePiModeCommand, registerPiModeShortcut, type PiModeCommandDeps } from "./index.ts";
import { applyToolSetTransition } from "./tool-set-transition.ts";
import { openPiModeSettingsUi } from "./ui.ts";

initTheme("dark");

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("handlePiModeCommand writes the selected tool set directly", async () => {
  const writes: Array<"pi" | "codex" | "droid"> = [];
  const sessionWrites: Array<"pi" | "codex" | "droid"> = [];
  const emitted: Array<"pi" | "codex" | "droid"> = [];
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    writeToolSet: async (value) => {
      writes.push(value);
    },
    writeSessionToolSet: async (value) => {
      sessionWrites.push(value);
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeIncludePiPromptSection: async () => {
      throw new Error("writeIncludePiPromptSection should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitToolSetChange: async (value) => {
      emitted.push(value);
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handlePiModeCommand(
    "tool-set pi",
    {
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
      },
    } as never,
    deps,
  );

  assert.deepEqual(writes, ["pi"]);
  assert.deepEqual(sessionWrites, ["pi"]);
  assert.deepEqual(emitted, ["pi"]);
  assert.deepEqual(notifications, ["Mode: Pi"]);
});

test("openPiModeSettingsUi applies the same tool-set transition side effects", async () => {
  const writes: Array<"pi" | "codex" | "droid"> = [];
  const sessionWrites: Array<"pi" | "codex" | "droid"> = [];
  const emitted: Array<"pi" | "codex" | "droid"> = [];
  const notifications: string[] = [];

  await openPiModeSettingsUi(
    {
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
        async custom(
          render: (
            tui: unknown,
            theme: { fg: (_color: string, text: string) => string; bold: (text: string) => string },
            kb: unknown,
            done: (value: unknown) => void,
          ) => { handleInput?: (data: string) => void },
        ) {
          const component = render(
            undefined,
            {
              fg: (_color: string, text: string) => text,
              bold: (text: string) => text,
            },
            undefined,
            () => undefined,
          );

          component.handleInput?.("\r");
          await flushMicrotasks();
        },
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        systemMdPrompt: true,
        includePiPromptSection: false,
        webTools: {},
      }),
      applyToolSetTransition: (transitionCtx, value) =>
        applyToolSetTransition(
          transitionCtx,
          {
            writeToolSet: async (toolSet) => {
              writes.push(toolSet);
            },
            writeSessionToolSet: async (toolSet) => {
              sessionWrites.push(toolSet);
            },
            emitToolSetChange: async (toolSet) => {
              emitted.push(toolSet);
            },
          },
          value,
        ),
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeIncludePiPromptSection: async () => {
        throw new Error("writeIncludePiPromptSection should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
    },
  );

  assert.deepEqual(writes, ["codex"]);
  assert.deepEqual(sessionWrites, ["codex"]);
  assert.deepEqual(emitted, ["codex"]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0], "Mode: Codex");
});

test("handlePiModeCommand writes the selected system-md setting directly", async () => {
  const writes: boolean[] = [];
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSystemMdPrompt: async (value) => {
      writes.push(value);
    },
    writeIncludePiPromptSection: async () => {
      throw new Error("writeIncludePiPromptSection should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handlePiModeCommand(
    "system-md off",
    {
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
      },
    } as never,
    deps,
  );

  assert.deepEqual(writes, [false]);
  assert.deepEqual(notifications, ["Inject SYSTEM.md: Disabled"]);
});

test("handlePiModeCommand writes the include-pi-prompt setting directly", async () => {
  const writes: boolean[] = [];
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      systemMdPrompt: false,
      includePiPromptSection: false,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeIncludePiPromptSection: async (value) => {
      writes.push(value);
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handlePiModeCommand(
    "include-pi-prompt on",
    {
      hasUI: true,
      ui: {
        notify(message: string) {
          notifications.push(message);
        },
      },
    } as never,
    deps,
  );

  assert.deepEqual(writes, [true]);
  assert.deepEqual(notifications, ["Include Pi prompt section: Enabled"]);
});

test("registerPiModeShortcut cycles pi -> codex -> droid -> pi without saving global config", async () => {
  const writes: Array<"pi" | "codex" | "droid"> = [];
  const sessionWrites: Array<"pi" | "codex" | "droid"> = [];
  const emitted: Array<"pi" | "codex" | "droid"> = [];
  const notifications: string[] = [];
  let shortcutHandler: ((ctx: unknown) => Promise<void>) | undefined;

  registerPiModeShortcut(
    {
      registerShortcut(_key: string, config: { handler: (ctx: unknown) => Promise<void> }) {
        shortcutHandler = config.handler;
      },
      appendEntry() {},
      events: {
        emit() {},
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        systemMdPrompt: false,
        includePiPromptSection: false,
        webTools: {},
      }),
      writeToolSet: async (value) => {
        writes.push(value);
      },
      writeSessionToolSet: async (value) => {
        sessionWrites.push(value);
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeIncludePiPromptSection: async () => {
        throw new Error("writeIncludePiPromptSection should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      emitToolSetChange: async (value) => {
        emitted.push(value);
      },
      openSettingsUi: async () => {
        throw new Error("settings UI should not open while cycling");
      },
    },
  );

  assert.notEqual(shortcutHandler, undefined);

  const makeCtx = (toolSet: "pi" | "codex" | "droid") => ({
    hasUI: true,
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:tool-set", data: { toolSet } }];
      },
    },
  });

  await shortcutHandler!(makeCtx("pi"));
  await shortcutHandler!(makeCtx("codex"));
  await shortcutHandler!(makeCtx("droid"));

  assert.deepEqual(writes, []);
  assert.deepEqual(sessionWrites, ["codex", "droid", "pi"]);
  assert.deepEqual(emitted, ["codex", "droid", "pi"]);
  assert.deepEqual(notifications, ["Mode: Codex", "Mode: Droid", "Mode: Pi"]);
});

test("handlePiModeCommand opens the package settings UI for root invocations", async () => {
  let openedFocus: string | undefined;
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      systemMdPrompt: true,
      includePiPromptSection: false,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeIncludePiPromptSection: async () => {
      throw new Error("writeIncludePiPromptSection should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    openSettingsUi: async (_ctx, options) => {
      openedFocus = options.focus;
    },
  };

  await handlePiModeCommand("", { hasUI: true, ui: { notify() {} } } as never, deps);

  assert.equal(openedFocus, undefined);
});
