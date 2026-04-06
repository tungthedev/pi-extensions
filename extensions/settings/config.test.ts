import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseTungthedevSettings,
  readTungthedevSettingsFromFile,
  writeCustomShellToolSetting,
  writeSystemMdPromptSetting,
  writeToolSetSetting,
} from "./config.ts";

test("parseTungthedevSettings accepts tool-set values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { toolSet: "codex" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(
    parseTungthedevSettings({
      "tungthedev/pi": {
        toolSet: "forge",
        customShellTool: false,
      },
    }),
    {
      toolSet: "forge",
      customShellTool: false,
      systemMdPrompt: false,
    },
  );
});

test("parseTungthedevSettings migrates legacy systemPrompt to tool set", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "forge" } }), {
    toolSet: "forge",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "codex" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings accepts system-md prompt toggle values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemMdPrompt: false } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to codex for invalid tool-set values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { toolSet: "weird" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": "broken" }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings(undefined), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to enabled for invalid custom shell values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { customShellTool: "nope" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to disabled for invalid system-md values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemMdPrompt: "nope" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("readTungthedevSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readTungthedevSettingsFromFile(settingsPath), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("writeToolSetSetting preserves unrelated root settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        theme: "dark",
        packages: ["npm:@tungthedev/pi-extensions"],
        "other/namespace": { enabled: true },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeToolSetSetting("forge", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.equal(updated.theme, "dark");
  assert.deepEqual(updated.packages, ["npm:@tungthedev/pi-extensions"]);
  assert.deepEqual(updated["other/namespace"], { enabled: true });
  assert.deepEqual(updated["tungthedev/pi"], { toolSet: "forge" });
});

test("writeToolSetSetting removes the legacy systemPrompt key", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        "tungthedev/pi": { systemPrompt: "forge" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeToolSetSetting("forge", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.deepEqual(updated["tungthedev/pi"], { toolSet: "forge" });
});

test("writeToolSetSetting stores the selected tool set", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeToolSetSetting("forge", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { toolSet: "forge" });
});

test("writeCustomShellToolSetting stores the selected custom shell toggle", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeCustomShellToolSetting(false, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { customShellTool: false });
});

test("writeSystemMdPromptSetting stores the selected system-md toggle", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeSystemMdPromptSetting(false, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { systemMdPrompt: false });
});

test("writeTungthedev settings cleanup drops legacy keys", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        "tungthedev/pi": {
          systemPrompt: "forge",
          skillListInjection: false,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeToolSetSetting("forge", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { toolSet: "forge" });
});
