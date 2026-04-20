import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parsePiModeSettings,
  readPiModeSettingsSync,
  readSettingsFromFile,
  writeLoadSkillsSetting,
  writeToolSetSetting,
  writeWebToolSetting,
} from "./config.ts";
import { readSessionToolSet, resolveSessionToolSet, TOOL_SET_OVERRIDE_ENV } from "./session.ts";

test("readSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readSettingsFromFile(settingsPath), {
    toolSet: "pi",
    loadSkills: true,
    systemMdPrompt: false,
    webTools: {},
  });
});

test("parsePiModeSettings migrates legacy forge settings to pi", () => {
  assert.deepEqual(parsePiModeSettings({ "pi-mode": { toolSet: "forge" } }), {
    toolSet: "pi",
    loadSkills: true,
    systemMdPrompt: false,
    webTools: {},
  });
});

test("readPiModeSettingsSync reads stored web tool settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        "pi-mode": {
          webTools: {
            geminiApiKey: " gemini-secret ",
            firecrawlApiKey: " firecrawl-secret ",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  assert.deepEqual(readPiModeSettingsSync(settingsPath), {
    toolSet: "pi",
    loadSkills: true,
    systemMdPrompt: false,
    webTools: {
      geminiApiKey: "gemini-secret",
      firecrawlApiKey: "firecrawl-secret",
    },
  });
});

test("readSessionToolSet migrates legacy forge session entries to pi", () => {
  assert.equal(
    readSessionToolSet([
      { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "forge" } },
    ]),
    "pi",
  );
});

test("resolveSessionToolSet prefers explicit environment override over session history", async () => {
  assert.equal(
    await resolveSessionToolSet(
      {
        getBranch: () => [
          { type: "custom", customType: "pi-mode:tool-set", data: { toolSet: "codex" } },
        ],
      },
      { [TOOL_SET_OVERRIDE_ENV]: "droid" },
    ),
    "droid",
  );
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

  await writeToolSetSetting("droid", settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.equal(updated.theme, "dark");
  assert.deepEqual(updated.packages, ["npm:@tungthedev/pi-extensions"]);
  assert.deepEqual(updated["other/namespace"], { enabled: true });
  assert.deepEqual(updated["pi-mode"], { toolSet: "droid" });
});

test("writeLoadSkillsSetting persists the load-skills toggle", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{}\n", "utf8");

  await writeLoadSkillsSetting(false, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["pi-mode"], { loadSkills: false });
});

test("writeWebToolSetting persists and clears stored web tool secrets", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{}\n", "utf8");

  await writeWebToolSetting("geminiApiKey", " gemini-key ", settingsPath);
  await writeWebToolSetting("firecrawlApiKey", "firecrawl-key", settingsPath);
  await writeWebToolSetting("geminiApiKey", undefined, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.deepEqual(updated["pi-mode"], {
    webTools: {
      firecrawlApiKey: "firecrawl-key",
    },
  });
});

test("writeToolSetSetting rejects invalid root objects in strict mode", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-tung-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "[]\n", "utf8");

  await assert.rejects(
    writeToolSetSetting("codex", settingsPath),
    /Invalid settings format.*expected object/,
  );
});
