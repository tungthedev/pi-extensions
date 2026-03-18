import assert from "node:assert/strict";
import { test } from "bun:test";
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
    assert.equal(entries.some((entry) => entry.activePath === missingPath), false);
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
