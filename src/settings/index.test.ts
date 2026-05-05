import { initTheme } from "@mariozechner/pi-coding-agent";
import assert from "node:assert/strict";
import test from "node:test";

import { handlePiModeCommand, registerPiModeShortcut, type PiModeCommandDeps } from "./index.ts";
import { TOOL_SET_OVERRIDE_ENV } from "./session.ts";
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
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    writeToolSet: async (value) => {
      writes.push(value);
    },
    writeSessionToolSet: async (value) => {
      sessionWrites.push(value);
    },
    writeSessionLoadSkills: async () => {
      throw new Error("writeSessionLoadSkills should not run");
    },
    writeLoadSkills: async () => {
      throw new Error("writeLoadSkills should not run");
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitToolSetChange: async (value) => {
      emitted.push(value);
    },
    emitLoadSkillsChange: async () => {
      throw new Error("emitLoadSkillsChange should not run");
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
        loadSkills: true,
        systemMdPrompt: true,
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
      applyLoadSkillsTransition: async () => {
        throw new Error("applyLoadSkillsTransition should not run");
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      writeEditorSettings: async () => {
        throw new Error("writeEditorSettings should not run");
      },
    },
  );

  assert.deepEqual(writes, ["codex"]);
  assert.deepEqual(sessionWrites, ["codex"]);
  assert.deepEqual(emitted, ["codex"]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0], "Mode: Codex");
});

test("openPiModeSettingsUi edits the mode shortcut from the root list", async () => {
  const shortcutWrites: string[] = [];
  const notifications: string[] = [];
  let component: { handleInput?: (data: string) => void; render?: (width: number) => string[] } | undefined;

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
          ) => { handleInput?: (data: string) => void; render?: (width: number) => string[] },
        ) {
          component = render(
            undefined,
            {
              fg: (_color: string, text: string) => text,
              bold: (text: string) => text,
            },
            undefined,
            () => undefined,
          );
        },
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        modeShortcut: "f2",
        webTools: {},
        editor: { fixedEditor: false, mouseScroll: true },
      } as never),
      applyToolSetTransition: async () => {
        throw new Error("applyToolSetTransition should not run");
      },
      applyLoadSkillsTransition: async () => {
        throw new Error("applyLoadSkillsTransition should not run");
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      writeModeShortcut: async (value: string) => {
        shortcutWrites.push(value);
      },
      writeEditorSettings: async () => {
        throw new Error("writeEditorSettings should not run");
      },
    } as never,
  );

  assert.ok(component);
  assert.ok(component.render?.(80).some((line) => line.includes("Mode Shortcut")));

  component.handleInput?.("\x1b[B");
  component.handleInput?.("\r");
  assert.match(component.render?.(80).join("\n") ?? "", /Pi Mode > Mode Shortcut/);

  component.handleInput?.("\x1b[3~");
  component.handleInput?.("\x1b[3~");
  component.handleInput?.("ctrl+o");
  component.handleInput?.("\r");
  await flushMicrotasks();

  assert.deepEqual(shortcutWrites, ["ctrl+o"]);
  assert.deepEqual(notifications, ["Mode shortcut: ctrl+o"]);
  assert.ok(component.render?.(80).some((line) => line.includes("ctrl+o")));
});

test("openPiModeSettingsUi toggles pin editor and enables mouse scroll with fixed mode", async () => {
  const editorWrites: Array<Record<string, boolean>> = [];
  const notifications: string[] = [];
  let component: { handleInput?: (data: string) => void; render?: (width: number) => string[] } | undefined;

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
          ) => { handleInput?: (data: string) => void; render?: (width: number) => string[] },
        ) {
          component = render(
            undefined,
            {
              fg: (_color: string, text: string) => text,
              bold: (text: string) => text,
            },
            undefined,
            () => undefined,
          );
        },
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        webTools: {},
        editor: { fixedEditor: false, mouseScroll: true },
      } as never),
      applyToolSetTransition: async () => {
        throw new Error("applyToolSetTransition should not run");
      },
      applyLoadSkillsTransition: async () => {
        throw new Error("applyLoadSkillsTransition should not run");
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      writeEditorSettings: async (settings: Record<string, boolean>) => {
        editorWrites.push(settings);
      },
    } as never,
  );

  assert.ok(component);
  assert.ok(component.render?.(80).some((line) => line.includes("Pin Editor")));

  component.handleInput?.("\x1b[B");
  component.handleInput?.("\x1b[B");
  component.handleInput?.("\r");
  await flushMicrotasks();

  assert.deepEqual(editorWrites, [{ fixedEditor: true, mouseScroll: true }]);
  assert.deepEqual(notifications, ["Pin editor: Enabled"]);
  assert.ok(component.render?.(80).some((line) => line.includes("Enabled")));
});

test("handlePiModeCommand writes the selected system-md setting directly", async () => {
  const writes: boolean[] = [];
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSessionLoadSkills: async () => {
      throw new Error("writeSessionLoadSkills should not run");
    },
    writeLoadSkills: async () => {
      throw new Error("writeLoadSkills should not run");
    },
    writeSystemMdPrompt: async (value) => {
      writes.push(value);
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitLoadSkillsChange: async () => {
      throw new Error("emitLoadSkillsChange should not run");
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

test("registerPiModeShortcut cycles pi -> codex -> droid -> pi without saving global config", async () => {
  const previousToolSetOverride = process.env[TOOL_SET_OVERRIDE_ENV];
  delete process.env[TOOL_SET_OVERRIDE_ENV];
  const writes: Array<"pi" | "codex" | "droid"> = [];
  const sessionWrites: Array<"pi" | "codex" | "droid"> = [];
  const emitted: Array<"pi" | "codex" | "droid"> = [];
  const notifications: string[] = [];
  const shortcutHandlers = new Map<string, (ctx: unknown) => Promise<void>>();

  await registerPiModeShortcut(
    {
      registerShortcut(key: string, config: { handler: (ctx: unknown) => Promise<void> }) {
        shortcutHandlers.set(key, config.handler);
      },
      appendEntry() {},
      events: {
        emit() {},
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        webTools: {},
      }),
      writeToolSet: async (value) => {
        writes.push(value);
      },
      writeSessionToolSet: async (value) => {
        sessionWrites.push(value);
      },
      writeSessionLoadSkills: async () => {
        throw new Error("writeSessionLoadSkills should not run");
      },
      writeLoadSkills: async () => {
        throw new Error("writeLoadSkills should not run");
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      emitToolSetChange: async (value) => {
        emitted.push(value);
      },
      emitLoadSkillsChange: async () => {
        throw new Error("emitLoadSkillsChange should not run");
      },
      openSettingsUi: async () => {
        throw new Error("settings UI should not open while cycling");
      },
    },
  );

  assert.notEqual(shortcutHandlers.get("f2"), undefined);
  assert.notEqual(shortcutHandlers.get("ctrl+alt+k"), undefined);

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

  try {
    await shortcutHandlers.get("f2")!(makeCtx("pi"));
    await shortcutHandlers.get("f2")!(makeCtx("codex"));
    await shortcutHandlers.get("f2")!(makeCtx("droid"));

    assert.deepEqual(writes, []);
    assert.deepEqual(sessionWrites, ["codex", "droid", "pi"]);
    assert.deepEqual(emitted, ["codex", "droid", "pi"]);
    assert.deepEqual(notifications, ["Mode: Codex", "Mode: Droid", "Mode: Pi"]);
  } finally {
    if (previousToolSetOverride === undefined) delete process.env[TOOL_SET_OVERRIDE_ENV];
    else process.env[TOOL_SET_OVERRIDE_ENV] = previousToolSetOverride;
  }
});

test("registerPiModeShortcut uses configured mode shortcut", async () => {
  const shortcutHandlers = new Map<string, (ctx: unknown) => Promise<void>>();

  await registerPiModeShortcut(
    {
      registerShortcut(key: string, config: { handler: (ctx: unknown) => Promise<void> }) {
        shortcutHandlers.set(key, config.handler);
      },
      appendEntry() {},
      events: {
        emit() {},
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        modeShortcut: "ctrl+o",
        webTools: {},
      }),
      writeToolSet: async () => {},
      writeSessionToolSet: async () => {},
      writeSessionLoadSkills: async () => {},
      writeLoadSkills: async () => {},
      writeSystemMdPrompt: async () => {},
      writeWebToolSetting: async () => {},
      openSettingsUi: async () => {},
    },
  );

  assert.equal(shortcutHandlers.has("ctrl+o"), true);
  assert.equal(shortcutHandlers.has("f2"), false);
});

test("registerPiModeShortcut toggles load-skills for the current session without saving global config", async () => {
  const writes: boolean[] = [];
  const sessionWrites: boolean[] = [];
  const emitted: boolean[] = [];
  const notifications: string[] = [];
  const shortcutHandlers = new Map<string, (ctx: unknown) => Promise<void>>();

  await registerPiModeShortcut(
    {
      registerShortcut(key: string, config: { handler: (ctx: unknown) => Promise<void> }) {
        shortcutHandlers.set(key, config.handler);
      },
      appendEntry() {},
      events: {
        emit() {},
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        webTools: {},
      }),
      writeToolSet: async () => {
        throw new Error("writeToolSet should not run");
      },
      writeSessionToolSet: async () => {
        throw new Error("writeSessionToolSet should not run");
      },
      writeSessionLoadSkills: async (value) => {
        sessionWrites.push(value);
      },
      writeLoadSkills: async (value) => {
        writes.push(value);
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      emitToolSetChange: async () => {
        throw new Error("emitToolSetChange should not run");
      },
      emitLoadSkillsChange: async (value) => {
        emitted.push(value);
      },
      openSettingsUi: async () => {
        throw new Error("settings UI should not open while toggling");
      },
    },
  );

  assert.notEqual(shortcutHandlers.get("ctrl+alt+k"), undefined);

  const makeCtx = (loadSkills: boolean) => ({
    hasUI: true,
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
    sessionManager: {
      getBranch() {
        return [{ type: "custom", customType: "pi-mode:load-skills", data: { loadSkills } }];
      },
    },
  });

  await shortcutHandlers.get("ctrl+alt+k")!(makeCtx(true));
  await shortcutHandlers.get("ctrl+alt+k")!(makeCtx(false));

  assert.deepEqual(writes, []);
  assert.deepEqual(sessionWrites, [false, true]);
  assert.deepEqual(emitted, [false, true]);
});

test("handlePiModeCommand opens the package settings UI for root invocations", async () => {
  let openedFocus: string | undefined;
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      loadSkills: true,
      systemMdPrompt: true,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSessionLoadSkills: async () => {
      throw new Error("writeSessionLoadSkills should not run");
    },
    writeLoadSkills: async () => {
      throw new Error("writeLoadSkills should not run");
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitLoadSkillsChange: async () => {
      throw new Error("emitLoadSkillsChange should not run");
    },
    openSettingsUi: async (_ctx, options) => {
      openedFocus = options.focus;
    },
  };

  await handlePiModeCommand("", { hasUI: true, ui: { notify() {} } } as never, deps);

  assert.equal(openedFocus, undefined);
});

test("handlePiModeCommand rejects removed include-pi-prompt commands", async () => {
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "droid",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSessionLoadSkills: async () => {
      throw new Error("writeSessionLoadSkills should not run");
    },
    writeLoadSkills: async () => {
      throw new Error("writeLoadSkills should not run");
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitLoadSkillsChange: async () => {
      throw new Error("emitLoadSkillsChange should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open");
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

  assert.deepEqual(notifications, [
    "Include Pi prompt section has been removed. Prompt selection now follows mode + optional SYSTEM.md.",
  ]);
});

test("handlePiModeCommand writes the selected load-skills setting directly", async () => {
  const writes: boolean[] = [];
  const sessionWrites: boolean[] = [];
  const emitted: boolean[] = [];
  const notifications: string[] = [];
  const deps: PiModeCommandDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      loadSkills: true,
      systemMdPrompt: false,
      webTools: {},
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeSessionToolSet: async () => {},
    writeSessionLoadSkills: async (value) => {
      sessionWrites.push(value);
    },
    writeLoadSkills: async (value) => {
      writes.push(value);
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    writeWebToolSetting: async () => {
      throw new Error("writeWebToolSetting should not run");
    },
    emitLoadSkillsChange: async (value) => {
      emitted.push(value);
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handlePiModeCommand(
    "load-skills off",
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
  assert.deepEqual(sessionWrites, [false]);
  assert.deepEqual(emitted, [false]);
});

test("openPiModeSettingsUi opens prompt injection settings from System Prompt", async () => {
  let rendered = "";

  await openPiModeSettingsUi(
    {
      hasUI: true,
      ui: {
        notify() {},
        async custom(
          render: (
            tui: unknown,
            theme: { fg: (_color: string, text: string) => string; bold: (text: string) => string },
            kb: unknown,
            done: (value: unknown) => void,
          ) => { handleInput?: (data: string) => void; render(width: number): string[] },
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

          component.handleInput?.("\x1b[B");
          component.handleInput?.("\x1b[B");
          component.handleInput?.("\x1b[B");
          component.handleInput?.("\r");
          rendered = component.render(100).join("\n");
        },
      },
    } as never,
    {
      readSettings: async () => ({
        toolSet: "pi",
        loadSkills: true,
        systemMdPrompt: false,
        webTools: {},
      }),
      applyToolSetTransition: async () => {
        throw new Error("applyToolSetTransition should not run");
      },
      applyLoadSkillsTransition: async () => {
        throw new Error("applyLoadSkillsTransition should not run");
      },
      writeSystemMdPrompt: async () => {
        throw new Error("writeSystemMdPrompt should not run");
      },
      writeWebToolSetting: async () => {
        throw new Error("writeWebToolSetting should not run");
      },
      writeEditorSettings: async () => {
        throw new Error("writeEditorSettings should not run");
      },
    },
  );

  assert.match(rendered, /Pi Mode > System Prompt/);
  assert.match(rendered, /Inject Skills/);
  assert.match(rendered, /Inject SYSTEM\.md/);
});
