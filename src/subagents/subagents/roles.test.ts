import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadBuiltinRoles } from "./roles-builtins.ts";
import { resolveRoleSet } from "./roles-discovery.ts";
import { parseMarkdownRole, serializeMarkdownRole } from "./roles-serializer.ts";
import { deleteRole, renameRole, saveRole } from "./roles-storage.ts";

function withTempHome(testBody: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-roles-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  const finish = () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    rmSync(root, { recursive: true, force: true });
  };

  return Promise.resolve()
    .then(() => testBody(root))
    .finally(finish);
}

function writeRole(filePath: string, contents: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

test("builtin markdown roles expose the expected builtin names", () => {
  const builtins = loadBuiltinRoles();

  assert.deepEqual(
    builtins.map((role) => role.name),
    ["default", "planner", "researcher", "reviewer", "scout"],
  );
  assert.equal(builtins.find((role) => role.name === "default")?.prompt ?? "", "");
});

test("layered discovery keeps builtin, user, and project definitions for the same name", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project", "nested", "dir");
    const projectAgentsDir = path.join(homeRoot, "workspace", "project", ".agents");
    const userAgentsDir = path.join(homeRoot, ".agents");
    mkdirSync(cwd, { recursive: true });

    writeRole(
      path.join(userAgentsDir, "reviewer.md"),
      `---\nname: reviewer\ndescription: User reviewer\nmodel: openai/gpt-5\nthinking: medium\n---\n\nUser prompt\n`,
    );
    writeRole(
      path.join(projectAgentsDir, "reviewer.md"),
      `---\nname: reviewer\ndescription: Project reviewer\nmodel: anthropic/claude-sonnet-4-5\nthinking: high\n---\n\nProject prompt\n`,
    );

    const resolved = resolveRoleSet({ cwd });
    const layeredReviewerEntries = resolved.layered.filter((role) => role.name === "reviewer");

    assert.equal(layeredReviewerEntries.length, 3);
    assert.deepEqual(
      layeredReviewerEntries.map((role) => role.source),
      ["builtin", "user", "project"],
    );
    assert.equal(resolved.effective.get("reviewer")?.source, "project");
    assert.equal(resolved.effective.get("reviewer")?.description, "Project reviewer");
  });
});

test("serializer round-trips markdown role frontmatter and prompt body", () => {
  const raw = `---\nname: reviewer\ndescription: Review changes\nmodel: openai/gpt-5\nthinking: high\n---\n\nPrompt\n`;

  const parsed = parseMarkdownRole(raw, "/tmp/reviewer.md", "user");
  const serialized = serializeMarkdownRole(parsed);

  assert.equal(parsed.name, "reviewer");
  assert.equal(parsed.description, "Review changes");
  assert.equal(parsed.model, "openai/gpt-5");
  assert.equal(parsed.thinking, "high");
  assert.equal(parsed.prompt, "Prompt");
  assert.match(serialized, /model: openai\/gpt-5/);
  assert.match(serialized, /thinking: high/);
  assert.match(serialized, /\n\nPrompt\n$/);
});

test("loader rejects filename and frontmatter name mismatches", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace");
    const userAgentsDir = path.join(homeRoot, ".agents");
    mkdirSync(cwd, { recursive: true });

    writeRole(
      path.join(userAgentsDir, "reviewer.md"),
      `---\nname: scout\ndescription: Wrong file\n---\n\nPrompt\n`,
    );

    const resolved = resolveRoleSet({ cwd });

    assert.equal(resolved.effective.has("reviewer"), true);
    assert.equal(resolved.effective.has("scout"), true);
    assert.match(
      resolved.warnings.join("\n"),
      /frontmatter name 'scout' does not match filename 'reviewer'/,
    );
    assert.equal(
      resolved.layered.some((role) => role.source === "user" && role.filePath.endsWith("reviewer.md")),
      false,
    );
  });
});

test("renaming a custom role changes the file path and rejects same-scope collisions", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project", "nested");
    const projectAgentsDir = path.join(homeRoot, "workspace", "project", ".agents");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(projectAgentsDir, { recursive: true });

    const created = saveRole({
      cwd,
      scope: "project",
      role: {
        name: "alpha",
        description: "Alpha role",
        prompt: "Alpha prompt",
        model: "openai/gpt-5",
        thinking: "medium",
      },
    });
    saveRole({
      cwd,
      scope: "project",
      role: {
        name: "beta",
        description: "Beta role",
        prompt: "Beta prompt",
      },
    });

    const renamed = renameRole({ cwd, scope: "project", fromName: "alpha", toName: "gamma" });

    assert.equal(existsSync(created.filePath), false);
    assert.equal(existsSync(renamed.filePath), true);
    assert.match(readFileSync(renamed.filePath, "utf8"), /name: gamma/);
    assert.throws(
      () => renameRole({ cwd, scope: "project", fromName: "gamma", toName: "beta" }),
      /already exists in project scope/,
    );
  });
});

test("legacy Codex files and legacy ~/.pi/agent/agents emit warnings but are not loaded", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(cwd, { recursive: true });

    writeRole(
      path.join(homeRoot, ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Modern delegate\n---\n\nModern prompt\n`,
    );
    writeRole(path.join(cwd, ".codex", "config.toml"), "[agents.reviewer]\n");
    writeRole(path.join(cwd, ".codex", "agents", "reviewer.toml"), 'name = "reviewer"\n');
    writeRole(
      path.join(homeRoot, ".pi", "agent", "agents", "planner.md"),
      `---\nname: planner\ndescription: Legacy planner\n---\n\nLegacy prompt\n`,
    );

    const resolved = resolveRoleSet({ cwd });
    const warnings = resolved.warnings.join("\n");

    assert.match(warnings, /legacy Codex\/TOML subagent roles were detected/i);
    assert.match(warnings, /legacy ~\/\.pi\/agent\/agents roles were detected/i);
    assert.equal(resolved.effective.get("delegate")?.description, "Modern delegate");
    assert.notEqual(resolved.effective.get("planner")?.description, "Legacy planner");
  });
});

test("project-scope save uses the same nearest-.agents resolver as discovery", async () => {
  await withTempHome((homeRoot) => {
    const projectRoot = path.join(homeRoot, "workspace", "project");
    const cwd = path.join(projectRoot, "apps", "web", "src");
    const projectAgentsDir = path.join(projectRoot, ".agents");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(projectAgentsDir, { recursive: true });

    const saved = saveRole({
      cwd,
      scope: "project",
      role: {
        name: "reviewer-lite",
        description: "Project role",
        prompt: "Prompt",
      },
    });

    assert.equal(saved.filePath, path.join(projectAgentsDir, "reviewer-lite.md"));
    assert.equal(existsSync(path.join(cwd, ".agents", "reviewer-lite.md")), false);

    const resolved = resolveRoleSet({ cwd });
    assert.equal(resolved.effective.get("reviewer-lite")?.source, "project");

    deleteRole({ cwd, scope: "project", name: "reviewer-lite" });
    assert.equal(existsSync(saved.filePath), false);
  });
});

test("saveRole rejects same-scope duplicate names instead of overwriting", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    const projectAgentsDir = path.join(homeRoot, "workspace", "project", ".agents");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(projectAgentsDir, { recursive: true });

    saveRole({
      cwd,
      scope: "project",
      role: {
        name: "reviewer-lite",
        description: "Original",
        prompt: "Original prompt",
      },
    });

    assert.throws(
      () =>
        saveRole({
          cwd,
          scope: "project",
          role: {
            name: "reviewer-lite",
            description: "Replacement",
            prompt: "Replacement prompt",
          },
        }),
      /already exists in project scope/,
    );

    assert.match(
      readFileSync(path.join(projectAgentsDir, "reviewer-lite.md"), "utf8"),
      /description: Original/,
    );
  });
});

test("saveRole rejects reserved builtin default as a custom role name", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(cwd, { recursive: true });

    assert.throws(
      () =>
        saveRole({
          cwd,
          scope: "user",
          role: {
            name: "default",
            description: "Nope",
            prompt: "Nope",
          },
        }),
      /reserved builtin role name/i,
    );

    assert.throws(
      () => renameRole({ cwd, scope: "user", fromName: "alpha", toName: "default" }),
      /reserved builtin role name/i,
    );
  });
});

test("project scope can be bootstrapped from a repo root without an existing .agents directory", async () => {
  await withTempHome((homeRoot) => {
    const projectRoot = path.join(homeRoot, "workspace", "project");
    const cwd = path.join(projectRoot, "apps", "web");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.join(projectRoot, ".git"), { recursive: true });

    const saved = saveRole({
      cwd,
      scope: "project",
      role: {
        name: "planner-lite",
        description: "Planner",
        prompt: "Plan it",
      },
    });

    assert.equal(saved.filePath, path.join(projectRoot, ".agents", "planner-lite.md"));
    assert.equal(existsSync(saved.filePath), true);
  });
});

test("legacy .agents toml files emit warnings instead of being silently ignored", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    const projectAgentsDir = path.join(cwd, ".agents");
    mkdirSync(projectAgentsDir, { recursive: true });
    writeRole(path.join(homeRoot, ".agents", "reviewer.toml"), 'name = "reviewer"\n');
    writeRole(path.join(projectAgentsDir, "planner.toml"), 'name = "planner"\n');

    const resolved = resolveRoleSet({ cwd });
    assert.match(resolved.warnings.join("\n"), /legacy .*\.agents.*\.toml/i);
  });
});

test("plain codex config without agent roles does not emit a legacy subagent warning", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(path.join(cwd, ".codex"), { recursive: true });
    writeRole(path.join(cwd, ".codex", "config.toml"), "model = \"gpt-5\"\n");

    const resolved = resolveRoleSet({ cwd });
    assert.doesNotMatch(resolved.warnings.join("\n"), /legacy Codex\/TOML subagent roles were detected/i);
  });
});

test("env-resolved legacy codex config paths also emit migration warnings", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(cwd, { recursive: true });
    const codexHome = path.join(homeRoot, "custom-codex-home");
    mkdirSync(path.join(codexHome, "agents"), { recursive: true });
    writeRole(path.join(codexHome, "config.toml"), "[agents.reviewer]\n");
    writeRole(path.join(codexHome, "agents", "reviewer.toml"), 'name = "reviewer"\n');

    const previousCodexHome = process.env.CODEX_HOME;
    delete process.env.PI_CODEX_CONFIG_PATH;
    process.env.CODEX_HOME = codexHome;
    try {
      const resolved = resolveRoleSet({ cwd });
      assert.match(resolved.warnings.join("\n"), /legacy Codex\/TOML subagent roles were detected/i);
    } finally {
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
    }
  });
});
