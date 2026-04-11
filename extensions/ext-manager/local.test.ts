import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverLocalExtensions } from "./local.ts";

async function withTempEnv(
  run: (paths: { root: string; home: string; cwd: string }) => Promise<void>,
) {
  const previousHome = process.env.HOME;
  const root = await mkdtemp(path.join(os.tmpdir(), "ext-manager-local-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "project");

  await mkdir(home, { recursive: true });
  await mkdir(cwd, { recursive: true });

  try {
    process.env.HOME = home;
    await run({ root, home, cwd });
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("discoverLocalExtensions ignores missing configured files", async () => {
  await withTempEnv(async ({ cwd }) => {
    const settingsPath = path.join(cwd, ".pi", "settings.json");
    const missingPath = path.join(cwd, "missing-extension.ts");

    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          extensions: [missingPath],
        },
        null,
        2,
      ),
    );

    const entries = await discoverLocalExtensions(cwd);
    assert.equal(
      entries.some((entry) => entry.activePath === missingPath),
      false,
    );
  });
});

test("discoverLocalExtensions finds top-level files and directory index entries", async () => {
  await withTempEnv(async ({ cwd }) => {
    const projectExtensionsDir = path.join(cwd, ".pi", "extensions");

    await mkdir(path.join(projectExtensionsDir, "nested"), { recursive: true });
    await writeFile(path.join(projectExtensionsDir, "project-file.ts"), "export default 1\n");
    await writeFile(path.join(projectExtensionsDir, "nested", "index.js"), "module.exports = {}\n");

    const entries = await discoverLocalExtensions(cwd);

    assert.equal(
      entries.some((entry) => entry.displayName === ".pi/extensions/project-file.ts"),
      true,
    );
    assert.equal(
      entries.some((entry) => entry.displayName === ".pi/extensions/nested/index.js"),
      true,
    );
  });
});

test("discoverLocalExtensions resolves disabled top-level entries", async () => {
  await withTempEnv(async ({ cwd }) => {
    const projectExtensionsDir = path.join(cwd, ".pi", "extensions");
    const disabledPath = path.join(projectExtensionsDir, "disabled-entry.ts.disabled");

    await mkdir(projectExtensionsDir, { recursive: true });
    await writeFile(disabledPath, "export default 1\n");

    const entries = await discoverLocalExtensions(cwd);
    const entry = entries.find(
      (item) => item.displayName === ".pi/extensions/disabled-entry.ts",
    );

    assert.ok(entry);
    assert.equal(entry.state, "disabled");
    assert.equal(entry.disabledPath, disabledPath);
  });
});

test("discoverLocalExtensions resolves configured files and directories", async () => {
  await withTempEnv(async ({ cwd }) => {
    const settingsPath = path.join(cwd, ".pi", "settings.json");
    const configuredFilePath = path.join(cwd, "configured-file.ts");
    const configuredDirPath = path.join(cwd, "configured-dir");

    await mkdir(path.dirname(settingsPath), { recursive: true });
    await mkdir(configuredDirPath, { recursive: true });
    await writeFile(configuredFilePath, "export default 1\n");
    await writeFile(path.join(configuredDirPath, "index.ts"), "export default 1\n");
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          extensions: ["../configured-file.ts", "../configured-dir"],
        },
        null,
        2,
      ),
    );

    const entries = await discoverLocalExtensions(cwd);

    assert.equal(entries.some((entry) => entry.activePath === configuredFilePath), true);
    assert.equal(
      entries.some((entry) => entry.activePath === path.join(configuredDirPath, "index.ts")),
      true,
    );
  });
});

test("discoverLocalExtensions treats configured disabled files as disabled entries", async () => {
  await withTempEnv(async ({ cwd }) => {
    const settingsPath = path.join(cwd, ".pi", "settings.json");
    const activePath = path.join(cwd, "configured-extension.ts");
    const disabledPath = `${activePath}.disabled`;

    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(disabledPath, "export default function configured() {}\n");
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          extensions: [activePath],
        },
        null,
        2,
      ),
    );

    const entries = await discoverLocalExtensions(cwd);
    const entry = entries.find((item) => item.activePath === activePath);
    assert.ok(entry);
    assert.equal(entry.disabledPath, disabledPath);
    assert.equal(entry.state, "disabled");
  });
});
