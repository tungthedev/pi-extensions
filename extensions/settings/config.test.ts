import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseTungthedevSettings,
  readTungthedevSettingsFromFile,
  writeSystemPromptSetting,
} from "./config.ts";

test("parseTungthedevSettings accepts codex, forge, and null", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "codex" } }), {
    systemPrompt: "codex",
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "forge" } }), {
    systemPrompt: "forge",
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: null } }), {
    systemPrompt: null,
  });
});

test("parseTungthedevSettings falls back to null for invalid values", () => {
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": { systemPrompt: "weird" } }), {
    systemPrompt: null,
  });
  assert.deepEqual(parseTungthedevSettings({ "tungthedev/pi": "broken" }), {
    systemPrompt: null,
  });
  assert.deepEqual(parseTungthedevSettings(undefined), { systemPrompt: null });
});

test("readTungthedevSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readTungthedevSettingsFromFile(settingsPath), {
    systemPrompt: null,
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

test("writeSystemPromptSetting stores null when clearing the setting", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  await writeSystemPromptSetting(null, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["tungthedev/pi"], { systemPrompt: null });
});
