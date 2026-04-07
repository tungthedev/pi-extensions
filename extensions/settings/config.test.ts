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
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { toolSet: "pi" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { toolSet: "codex" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(
    parseTungthedevSettings({
      "pi-mode": {
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

test("parseTungthedevSettings still reads the legacy namespace", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { toolSet: "codex" } }), {
    toolSet: "codex",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings ignores legacy systemPrompt and falls back to pi", () => {
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { systemPrompt: "forge" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { systemPrompt: "codex" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings accepts system-md prompt toggle values", () => {
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { systemMdPrompt: false } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to pi for missing or invalid tool-set values", () => {
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { toolSet: "weird" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": "broken" }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
  assert.deepEqual(parseTungthedevSettings(undefined), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to enabled for invalid custom shell values", () => {
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { customShellTool: "nope" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("parseTungthedevSettings falls back to disabled for invalid system-md values", () => {
  assert.deepEqual(parseTungthedevSettings({ "pi-mode": { systemMdPrompt: "nope" } }), {
    toolSet: "pi",
    customShellTool: true,
    systemMdPrompt: false,
  });
});

test("readTungthedevSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readTungthedevSettingsFromFile(settingsPath), {
    toolSet: "pi",
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
  assert.deepEqual(updated["pi-mode"], { toolSet: "forge" });
});

test("writeToolSetSetting removes the legacy systemPrompt key and legacy namespace", async () => {
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

  assert.deepEqual(updated["pi-mode"], { toolSet: "forge" });
  assert.equal(updated["tungthedev/pi"], undefined);
});

test("writeToolSetSetting stores the selected tool set", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeToolSetSetting("pi", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["pi-mode"], { toolSet: "pi" });
});

test("writeCustomShellToolSetting stores the selected custom shell toggle", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeCustomShellToolSetting(false, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["pi-mode"], { customShellTool: false });
});

test("writeSystemMdPromptSetting stores the selected system-md toggle", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeSystemMdPromptSetting(false, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["pi-mode"], { systemMdPrompt: false });
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
  assert.deepEqual(updated["pi-mode"], { toolSet: "forge" });
  assert.equal(updated["tungthedev/pi"], undefined);
});
