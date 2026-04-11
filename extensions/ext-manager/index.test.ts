import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ExtensionManagerController } from "./controller/index.ts";
import extensionManager from "./index.ts";

test("extmgr command returns early without touching ctx.ui when UI is unavailable", async () => {
  let commandHandler: ((args: string[], ctx: Record<string, unknown>) => Promise<void>) | undefined;

  extensionManager({
    registerShortcut() {
      // no-op
    },
    registerCommand(
      _name: string,
      command: { handler: (args: string[], ctx: Record<string, unknown>) => Promise<void> },
    ) {
      commandHandler = command.handler as typeof commandHandler;
    },
  } as never);

  let uiAccessed = false;
  const ctx = {
    hasUI: false,
    ui: new Proxy(
      {},
      {
        get() {
          uiAccessed = true;
          throw new Error("ctx.ui should not be accessed");
        },
      },
    ),
  };

  assert.ok(commandHandler);
  await commandHandler([], ctx as never);
  assert.equal(uiAccessed, false);
});

test("managed local and package sections share staged toggle and persist workflows", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "ext-manager-controller-"));
  const localActivePath = path.join(cwd, ".pi", "extensions", "local-entry.ts");
  const localDisabledPath = `${localActivePath}.disabled`;

  await mkdir(path.dirname(localActivePath), { recursive: true });
  await writeFile(localActivePath, "export default 1\n");

  try {
    const controller = new ExtensionManagerController({} as never, { cwd } as never);
    controller.localEntries = [
      {
        id: `project:${localActivePath}`,
        scope: "project",
        state: "enabled",
        activePath: localActivePath,
        disabledPath: localDisabledPath,
        displayName: ".pi/extensions/local-entry.ts",
        summary: "Local entry",
      },
    ];
    controller.packages = [
      {
        id: "pkg-1",
        scope: "project",
        source: "npm:test-package",
        name: "test-package",
        resolvedPath: path.join(cwd, "node_modules", "test-package"),
      },
    ];
    controller.packageEntries.set("pkg-1", [
      {
        id: "pkg-1:fresh.ts",
        packageId: "pkg-1",
        packageSource: "npm:test-package",
        scope: "project",
        extensionPath: "fresh.ts",
        absolutePath: path.join(cwd, "node_modules", "test-package", "fresh.ts"),
        displayName: "fresh.ts",
        summary: "Package entry",
        available: true,
        originalState: "enabled",
      },
    ]);

    controller.localManagedEntries("project").toggle(`project:${localActivePath}`);
    (await controller.packageManagedEntries("pkg-1")).toggle("pkg-1:fresh.ts");

    const localSection = controller.localManagedEntries("project");
    const packageSection = await controller.packageManagedEntries("pkg-1");

    assert.equal(localSection.entries[0]?.currentState, "disabled");
    assert.equal(packageSection.entries[0]?.currentState, "disabled");
    assert.equal(localSection.pendingCount, 1);
    assert.equal(packageSection.pendingCount, 1);
    assert.deepEqual(localSection.saveAction, { type: "apply-local" });
    assert.deepEqual(packageSection.saveAction, { type: "save-package", packageId: "pkg-1" });

    assert.deepEqual(await controller.applyLocalChanges(), { changed: 1, errors: [] });
    assert.deepEqual(await controller.savePackageChanges("pkg-1"), { changed: 1, errors: [] });

    await stat(localDisabledPath);
    const packageSettings = JSON.parse(
      await readFile(path.join(cwd, ".pi", "settings.json"), "utf8"),
    ) as {
      packages: Array<{ source: string; extensions?: string[] }>;
    };

    assert.deepEqual(packageSettings.packages, [
      {
        source: "npm:test-package",
        extensions: ["-fresh.ts"],
      },
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
