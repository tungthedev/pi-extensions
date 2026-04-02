import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import settingsExtension, {
  handleTungthedevCommand,
  type TungthedevCommandDeps,
} from "./index.ts";
import { parseSettingsCommand } from "./ui.ts";

test("parseSettingsCommand handles direct system-prompt writes", () => {
  assert.deepEqual(parseSettingsCommand("system-prompt forge"), {
    action: "set-system-prompt",
    value: "forge",
  });
});

test("parseSettingsCommand handles none alias", () => {
  assert.deepEqual(parseSettingsCommand("system-prompt none"), {
    action: "set-system-prompt",
    value: null,
  });
});

test("parseSettingsCommand opens root settings UI when no args are provided", () => {
  assert.deepEqual(parseSettingsCommand(""), { action: "open-root" });
});

test("parseSettingsCommand handles direct tool-set writes", () => {
  assert.deepEqual(parseSettingsCommand("tool-set forge"), {
    action: "set-tool-set",
    value: "forge",
  });
});

test("handleTungthedevCommand writes the selected system prompt pack directly", async () => {
  const writes: Array<"codex" | "forge" | null> = [];
  const notifications: string[] = [];
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({ systemPrompt: null, toolSet: "codex" }),
    writeSystemPrompt: async (value) => {
      writes.push(value);
    },
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handleTungthedevCommand("system-prompt codex", {
    hasUI: true,
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
  } as never, deps);

  assert.deepEqual(writes, ["codex"]);
  assert.deepEqual(notifications, ["System prompt pack: Codex"]);
});

test("handleTungthedevCommand writes the selected tool set directly", async () => {
  const writes: Array<"codex" | "forge"> = [];
  const notifications: string[] = [];
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({ systemPrompt: null, toolSet: "codex" }),
    writeSystemPrompt: async () => {
      throw new Error("writeSystemPrompt should not run");
    },
    writeToolSet: async (value) => {
      writes.push(value);
    },
    openSettingsUi: async () => {
      throw new Error("settings UI should not open for direct writes");
    },
  };

  await handleTungthedevCommand("tool-set forge", {
    hasUI: true,
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
  } as never, deps);

  assert.deepEqual(writes, ["forge"]);
  assert.deepEqual(notifications, ["Tool set: Forge"]);
});

test("handleTungthedevCommand opens the package settings UI for root invocations", async () => {
  let openedFocus: string | undefined;
  const deps: TungthedevCommandDeps = {
    readSettings: async () => ({ systemPrompt: "forge", toolSet: "codex" }),
    writeSystemPrompt: async () => {
      throw new Error("writeSystemPrompt should not run");
    },
    writeToolSet: async () => {
      throw new Error("writeToolSet should not run");
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

test("package manifest ships prompt-pack and settings extensions", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    pi: { extensions: string[] };
  };

  assert(pkg.pi.extensions.includes("./extensions/prompt-pack/index.ts"));
  assert(pkg.pi.extensions.includes("./extensions/settings/index.ts"));
  assert(!pkg.pi.extensions.includes("./extensions/codex-system-prompt/index.ts"));
});
