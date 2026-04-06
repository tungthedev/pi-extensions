import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import settingsExtension, { handleTungthedevCommand, type TungthedevCommandDeps } from "./index.ts";
import { buildTungthedevSettingItems, parseSettingsCommand } from "./ui.ts";

test("parseSettingsCommand rejects the removed system-prompt setting", () => {
  assert.deepEqual(parseSettingsCommand("system-prompt forge"), {
    action: "invalid",
    message: "System prompts now follow the selected tool set. Use: tool-set pi|codex|forge",
  });
});

test("parseSettingsCommand opens root settings UI when no args are provided", () => {
  assert.deepEqual(parseSettingsCommand(""), { action: "open-root" });
});

test("parseSettingsCommand handles direct tool-set writes", () => {
  assert.deepEqual(parseSettingsCommand("tool-set pi"), {
    action: "set-tool-set",
    value: "pi",
  });
});

test("parseSettingsCommand keeps content-pack as a compatibility alias", () => {
  assert.deepEqual(parseSettingsCommand("content-pack forge"), {
    action: "set-tool-set",
    value: "forge",
  });
});

test("parseSettingsCommand handles direct custom shell tool writes", () => {
  assert.deepEqual(parseSettingsCommand("custom-shell-tool off"), {
    action: "set-custom-shell-tool",
    value: false,
  });
});

test("parseSettingsCommand handles direct system-md writes", () => {
  assert.deepEqual(parseSettingsCommand("system-md off"), {
    action: "set-system-md-prompt",
    value: false,
  });
});

test("parseSettingsCommand rejects removed skill list injection setting", () => {
  assert.deepEqual(parseSettingsCommand("skill-list-injection off"), {
    action: "invalid",
    message: "Unknown setting: skill-list-injection",
  });
});

test("buildTungthedevSettingItems includes descriptions for each setting", () => {
  const items = buildTungthedevSettingItems({
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: true,
  });

  assert.equal(items.length, 3);
  assert.equal(items[0]?.label, "Tool set");
  assert.equal(items[0]?.currentValue, "Pi");
  assert.deepEqual(items[0]?.values, ["Pi", "Codex", "Forge"]);
  assert.match(items[0]?.description ?? "", /Pi, Codex, or Forge tool and prompt behavior/);
  assert.match(items[1]?.description ?? "", /package shell tool/);
  assert.match(items[2]?.description ?? "", /overrides the active Pi, Codex, or Forge system prompt/);
});

test("handleTungthedevCommand writes the selected tool set directly", async () => {
  const writes: Array<"pi" | "codex" | "forge"> = [];
  const notifications: string[] = [];
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({
      toolSet: "pi",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    writeToolSet: async (value) => {
      writes.push(value);
    },
    writeCustomShellTool: async () => {
      throw new Error("writeCustomShellTool should not run");
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handleTungthedevCommand(
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
  assert.deepEqual(notifications, ["Tool set: Pi"]);
});

test("handleTungthedevCommand writes the selected custom shell setting directly", async () => {
  const writes: boolean[] = [];
  const notifications: string[] = [];
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeCustomShellTool: async (value) => {
      writes.push(value);
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handleTungthedevCommand(
    "custom-shell-tool off",
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
  assert.deepEqual(notifications, ["Custom shell tool: Disabled"]);
});

test("handleTungthedevCommand writes the selected system-md setting directly", async () => {
  const writes: boolean[] = [];
  const notifications: string[] = [];
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeCustomShellTool: async () => {
      throw new Error("writeCustomShellTool should not run");
    },
    writeSystemMdPrompt: async (value) => {
      writes.push(value);
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handleTungthedevCommand(
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
  assert.deepEqual(notifications, ["System.md prompt: Disabled"]);
});

test("handleTungthedevCommand opens the package settings UI for root invocations", async () => {
  let openedFocus: string | undefined;
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({
      toolSet: "codex",
      customShellTool: true,
      systemMdPrompt: true,
    }),
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    writeCustomShellTool: async () => {
      throw new Error("writeCustomShellTool should not run");
    },
    writeSystemMdPrompt: async () => {
      throw new Error("writeSystemMdPrompt should not run");
    },
    openSettingsUi: async (_ctx, options) => {
      openedFocus = options.focus;
    },
  };

  await handleTungthedevCommand("", { hasUI: true, ui: { notify() {} } } as never, deps);

  assert.equal(openedFocus, undefined);
});

test("settings extension registers the /tungthedev command", () => {
  let registeredName: string | undefined;

  settingsExtension({
    registerCommand(name: string) {
      registeredName = name;
    },
  } as never);

  assert.equal(registeredName, "tungthedev");
});

test("package manifest ships merged prompt extensions and settings", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    pi: { extensions: string[] };
  };

  assert(pkg.pi.extensions.includes("./extensions/codex-content/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/forge-content/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/system-md/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/shell/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/settings/index.ts"));
  assert(!pkg.pi.extensions.includes("./extensions/prompt-pack/index.ts"));
  assert(!pkg.pi.extensions.includes("./extensions/skill/index.ts"));
  assert(!pkg.pi.extensions.includes("./extensions/codex-system-prompt/index.ts"));
});
