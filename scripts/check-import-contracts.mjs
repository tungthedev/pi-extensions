import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const metadataFiles = [
  "src/boomerang/metadata.ts",
  "src/codex-content/metadata.ts",
  "src/droid-content/metadata.ts",
  "src/goal/metadata.ts",
  "src/shell/metadata.ts",
  "src/subagents/metadata.ts",
  "src/metadata.ts",
];
const forbiddenMetadataImport =
  /@((mariozechner|earendil-works)\/pi-|ff-labs\/fff-node)|openai|@google\/genai|pi-tui|\/index\.js"/;

for (const file of metadataFiles) {
  const contents = await readFile(join(root, file), "utf8");
  if (forbiddenMetadataImport.test(contents)) {
    throw new Error(`${file} imports a heavy runtime module`);
  }
}

const packText = execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" });
const [{ filename }] = JSON.parse(packText);
const tarball = join(root, filename);
const temp = await mkdtemp(join(tmpdir(), "pi-extensions-pack-"));

try {
  execFileSync("tar", ["-xzf", tarball, "-C", temp]);
  const pkgDir = join(temp, "package");
  const pkg = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));

  for (const entry of pkg.pi.extensions ?? []) {
    if (!existsSync(join(pkgDir, entry))) {
      throw new Error(`packed pi extension target missing: ${entry}`);
    }
  }

  const consumerDir = join(temp, "consumer");
  execFileSync("mkdir", ["-p", consumerDir]);
  execFileSync("npm", ["init", "-y"], { cwd: consumerDir, stdio: "ignore" });
  execFileSync("npm", ["install", tarball], { cwd: consumerDir, stdio: "ignore" });

  const imports = [
    ["@tungthedev/pi-extensions", "registerShellExtension"],
    ["@tungthedev/pi-extensions/metadata", "getPiExtensionsToolMetadata"],
    ["@tungthedev/pi-extensions/shell", "registerShellExtension"],
    ["@tungthedev/pi-extensions/shell/primitives", "createShellToolDefinition"],
    ["@tungthedev/pi-extensions/codex-content", "registerCodexContentExtension"],
    ["@tungthedev/pi-extensions/codex-content/primitives", "registerCodexCompatibilityTools"],
    ["@tungthedev/pi-extensions/droid-content/primitives", "registerDroidEasyTools"],
    ["@tungthedev/pi-extensions/goal", "registerGoalExtension"],
    ["@tungthedev/pi-extensions/goal/metadata", "GOAL_TOOLS"],
    ["@tungthedev/pi-extensions/subagents/primitives", "registerSubagentsCommand"],
    ["@tungthedev/pi-extensions/settings/config", "readPiModeSettings"],
    ["@tungthedev/pi-extensions/system-md/state", "buildSystemMdPrompt"],
    ["@tungthedev/pi-extensions/codex-content/patch/parser", "parsePatch"],
  ];

  const checkSource = `
    const imports = ${JSON.stringify(imports)};
    for (const [specifier, exportName] of imports) {
      const mod = await import(specifier);
      if (!(exportName in mod)) throw new Error(specifier + " does not export " + exportName);
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", checkSource], {
    cwd: consumerDir,
    stdio: "inherit",
  });

  console.log(`import contracts ok (${imports.length})`);
} finally {
  await rm(temp, { recursive: true, force: true });
  await rm(tarball, { force: true });
}
