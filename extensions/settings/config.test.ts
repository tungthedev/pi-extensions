import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseTungthedevSettings,
  readTungthedevSettingsFromFile,
  writeCustomShellToolSetting,
  writeToolSetSetting,
  writeSystemPromptSetting,
} from "./config.ts";

test("parseTungthedevSettings accepts prompt-pack values and tool-set values", () => {
  assert.deepEqual(
    parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "codex" } }),
    {
      systemPrompt: "codex",
      toolSet: "codex",
      customShellTool: true,
    },
  );
  assert.deepEqual(
    parseTungthedevSettings({
      "tungthedev/pi": {
        systemPrompt: "forge",
        toolSet: "forge",
        customShellTool: false,
      },
    }),
    {
      systemPrompt: "forge",
      toolSet: "forge",
      customShellTool: false,
    },
  );
  assert.deepEqual(
    parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: null, toolSet: "codex" } }),
    {
      systemPrompt: null,
      toolSet: "codex",
      customShellTool: true,
    },
  );
});

test("parseTungthedevSettings falls back to codex for invalid tool-set values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { toolSet: "weird" } }), {
    systemPrompt: null,
    toolSet: "codex",
    customShellTool: true,
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": "broken" }), {
    systemPrompt: null,
    toolSet: "codex",
    customShellTool: true,
  });
  assert.deepEqual(parseTungthedevSettings(undefined), {
    systemPrompt: null,
    toolSet: "codex",
    customShellTool: true,
  });
});

test("parseTungthedevSettings falls back to null for invalid system prompt values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "weird", toolSet: "forge" } }), {
    systemPrompt: null,
    toolSet: "forge",
    customShellTool: true,
  });
});

test("parseTungthedevSettings falls back to enabled for invalid custom shell values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { customShellTool: "nope" } }), {
    systemPrompt: null,
    toolSet: "codex",
    customShellTool: true,
  });
});

test("readTungthedevSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readTungthedevSettingsFromFile(settingsPath), {
    systemPrompt: null,
    toolSet: "codex",
    customShellTool: true,
  });
});

test("writeSystemPromptSetting preserves unrelated root settings", async () => {
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

  await writeSystemPromptSetting("forge", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.equal(updated.theme, "dark");
  assert.deepEqual(updated.packages, ["npm:@tungthedev/pi-extensions"]);
  assert.deepEqual(updated["other/namespace"], { enabled: true });
  assert.deepEqual(updated["tungthedev/pi"], { systemPrompt: "forge" });
});

test("writeToolSetSetting preserves unrelated package settings", async () => {
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

  assert.deepEqual(updated["tungthedev/pi"], { systemPrompt: "forge", toolSet: "forge" });
});

test("writeSystemPromptSetting stores null when clearing the setting", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeSystemPromptSetting(null, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { systemPrompt: null });
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

test("writeTungthedev settings cleanup drops legacy skillListInjection key", async () => {
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
  assert.deepEqual(updated["tungthedev/pi"], { systemPrompt: "forge", toolSet: "forge" });
});
