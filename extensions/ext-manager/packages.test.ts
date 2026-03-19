import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applyPackageExtensionStateChanges,
  getPackageFilterState,
  parseInstalledPackagesFromListOutput,
  updateExtensionMarkers,
} from "./packages.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ext-manager-packages-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("parseInstalledPackagesFromListOutput parses global and project package sections", () => {
  const parsed = parseInstalledPackagesFromListOutput(`Global packages
  npm:@scope/pkg (filtered)
    /tmp/global-pkg

Project packages
  ./local-package
    /work/local-package
`);

  assert.deepEqual(parsed, [
    {
      scope: "global",
      source: "npm:@scope/pkg",
      resolvedPath: "/tmp/global-pkg",
    },
    {
      scope: "project",
      source: "./local-package",
      resolvedPath: "/work/local-package",
    },
  ]);
});

test("getPackageFilterState applies include patterns, excludes, and explicit markers", () => {
  assert.equal(getPackageFilterState(undefined, "extensions/a.ts"), "enabled");
  assert.equal(getPackageFilterState([], "extensions/a.ts"), "disabled");
  assert.equal(
    getPackageFilterState(["extensions/**", "!extensions/private/**"], "extensions/a.ts"),
    "enabled",
  );
  assert.equal(
    getPackageFilterState(["extensions/**", "!extensions/private/**"], "extensions/private/a.ts"),
    "disabled",
  );
  assert.equal(
    getPackageFilterState(
      ["extensions/**", "!extensions/private/**", "+extensions/private/a.ts"],
      "extensions/private/a.ts",
    ),
    "enabled",
  );
  assert.equal(
    getPackageFilterState(["extensions/**", "-extensions/a.ts"], "extensions/a.ts"),
    "disabled",
  );
});

test("updateExtensionMarkers preserves non-marker tokens and replaces only changed markers", () => {
  const next = updateExtensionMarkers(
    ["extensions/**", "!extensions/private/**", "+old.ts", "-remove.ts"],
    new Map([
      ["z.ts", "enabled"],
      ["a.ts", "disabled"],
    ]),
  );

  assert.deepEqual(next, [
    "extensions/**",
    "!extensions/private/**",
    "+old.ts",
    "-remove.ts",
    "-a.ts",
    "+z.ts",
  ]);
});

test("applyPackageExtensionStateChanges merges package settings markers into project settings", async () => {
  await withTempDir(async (cwd) => {
    const settingsPath = path.join(cwd, ".pi", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          packages: [
            {
              source: "npm:test-package",
              extensions: ["extensions/**", "-old.ts", "+keep.ts"],
            },
          ],
        },
        null,
        2,
      ),
    );

    const result = await applyPackageExtensionStateChanges(
      "npm:test-package",
      "project",
      [
        { extensionPath: "old.ts", target: "enabled" },
        { extensionPath: "fresh.ts", target: "disabled" },
      ],
      cwd,
    );

    assert.deepEqual(result, { ok: true });

    const updated = JSON.parse(await readFile(settingsPath, "utf8")) as {
      packages: Array<{ source: string; extensions?: string[] }>;
    };

    assert.deepEqual(updated.packages, [
      {
        source: "npm:test-package",
        extensions: ["extensions/**", "+keep.ts", "-fresh.ts", "+old.ts"],
      },
    ]);
  });
});
