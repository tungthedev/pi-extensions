import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readEditorSettings,
  readEditorSettingsFromFile,
  resolveEditorSettingsWritePath,
  writeEditorSettings,
} from "./config.ts";

test("readEditorSettingsFromFile fails closed on malformed json", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(settingsPath, "{not-json", "utf8");

  assert.deepEqual(await readEditorSettingsFromFile(settingsPath), {
    fixedEditor: false,
    mouseScroll: true,
  });
});

test("readEditorSettings lets project settings override global settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-settings-"));
  const globalPath = path.join(tempDir, "global", "settings.json");
  const projectPath = path.join(tempDir, "project", ".pi", "settings.json");
  await mkdir(path.dirname(globalPath), { recursive: true });
  await mkdir(path.dirname(projectPath), { recursive: true });
  await writeFile(
    globalPath,
    `${JSON.stringify({ editor: { fixedEditor: true, mouseScroll: false } }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(projectPath, `${JSON.stringify({ editor: { mouseScroll: true } }, null, 2)}\n`, {
    encoding: "utf8",
  });

  assert.deepEqual(
    await readEditorSettings({ cwd: path.dirname(path.dirname(projectPath)), globalPath, projectPath }),
    {
      fixedEditor: true,
      mouseScroll: true,
    },
  );
});

test("writeEditorSettings preserves unrelated settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");
  await writeFile(
    settingsPath,
    `${JSON.stringify({ theme: "dark", packages: ["pkg"], editor: { mouseScroll: false } }, null, 2)}\n`,
    "utf8",
  );

  await writeEditorSettings({ fixedEditor: true }, settingsPath);

  const updated = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.equal(updated.theme, "dark");
  assert.deepEqual(updated.packages, ["pkg"]);
  assert.deepEqual(updated.editor, { mouseScroll: false, fixedEditor: true });
});

test("resolveEditorSettingsWritePath uses project file when it already has editor settings", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-settings-"));
  const globalPath = path.join(tempDir, "global", "settings.json");
  const projectPath = path.join(tempDir, "project", ".pi", "settings.json");
  await mkdir(path.dirname(projectPath), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify({ editor: { fixedEditor: false } })}\n`, "utf8");

  assert.equal(
    await resolveEditorSettingsWritePath({ cwd: path.dirname(path.dirname(projectPath)), globalPath, projectPath }),
    projectPath,
  );
});

test("resolveEditorSettingsWritePath uses global file when project file has no editor namespace", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-editor-settings-"));
  const globalPath = path.join(tempDir, "global", "settings.json");
  const projectPath = path.join(tempDir, "project", ".pi", "settings.json");
  await mkdir(path.dirname(projectPath), { recursive: true });
  await writeFile(projectPath, `${JSON.stringify({ "pi-mode": { toolSet: "codex" } })}\n`, "utf8");

  assert.equal(
    await resolveEditorSettingsWritePath({ cwd: path.dirname(path.dirname(projectPath)), globalPath, projectPath }),
    globalPath,
  );
});
