import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applySpawnAgentProfile,
  buildSpawnAgentTypeDescription,
  clearResolvedAgentProfilesCache,
  resolveAgentProfiles,
  resolveAgentProfileNames,
  resolveBuiltInAgentProfiles,
} from "./profiles.ts";

function withTempHome(testBody: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "subagent-profiles-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = root;
  process.env.USERPROFILE = root;

  const finish = () => {
    clearResolvedAgentProfilesCache();
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

test("applySpawnAgentProfile defaults to default profile and preserves explicit overrides", () => {
  const applied = applySpawnAgentProfile({
    profiles: resolveBuiltInAgentProfiles({ includeHidden: true }).profiles,
    requestedModel: "gpt-5-mini",
    requestedReasoningEffort: "medium",
  });

  assert.equal(applied.agentType, "default");
  assert.equal(applied.effectiveModel, "gpt-5-mini");
  assert.equal(applied.effectiveReasoningEffort, "medium");
  assert.equal(applied.bootstrap.name, "default");
});

test("built-in profiles include the bundled default, planner, researcher, reviewer, and scout roles", () => {
  const builtIns = resolveBuiltInAgentProfiles({ includeHidden: true });

  assert.deepEqual([...builtIns.profiles.keys()], [
    "default",
    "planner",
    "researcher",
    "reviewer",
    "scout",
  ]);

  assert.equal(builtIns.profiles.get("default")?.visible, true);
  assert.equal(builtIns.profiles.get("default")?.developerInstructions ?? "", "");
  for (const name of ["planner", "researcher", "reviewer", "scout"]) {
    assert.equal(builtIns.profiles.get(name)?.visible, true);
    assert.match(builtIns.profiles.get(name)?.developerInstructions ?? "", /\S/);
  }
});

test("resolveAgentProfiles uses cwd-aware markdown project shadowing", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project", "nested");
    mkdirSync(cwd, { recursive: true });

    writeRole(
      path.join(homeRoot, ".agents", "reviewer.md"),
      `---\nname: reviewer\ndescription: User reviewer\nmodel: openai/gpt-5\nthinking: medium\n---\n\nUser prompt\n`,
    );
    writeRole(
      path.join(homeRoot, "workspace", "project", ".agents", "reviewer.md"),
      `---\nname: reviewer\ndescription: Project reviewer\nmodel: anthropic/claude-sonnet-4-5\nthinking: high\n---\n\nProject prompt\n`,
    );

    const resolved = resolveAgentProfiles({ cwd, includeHidden: true });
    const description = buildSpawnAgentTypeDescription(resolved);
    const reviewer = resolved.profiles.get("reviewer");

    assert.equal(reviewer?.source, "project");
    assert.equal(reviewer?.description, "Project reviewer");
    assert.equal(reviewer?.developerInstructions, "Project prompt");
    assert.equal(reviewer?.model, "anthropic/claude-sonnet-4-5");
    assert.equal(reviewer?.reasoningEffort, "high");
    assert.match(description, /Project reviewer/);
    assert.doesNotMatch(description, /User reviewer/);
  });
});

test("resolveAgentProfileNames returns stable cwd-aware role names for autocomplete", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project", "nested");
    mkdirSync(cwd, { recursive: true });

    writeRole(
      path.join(homeRoot, ".agents", "reviewer.md"),
      `---\nname: reviewer\ndescription: User reviewer\n---\n\nUser prompt\n`,
    );
    writeRole(
      path.join(homeRoot, "workspace", "project", ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Project delegate\n---\n\nProject prompt\n`,
    );

    assert.deepEqual(resolveAgentProfileNames({ cwd }), [
      "default",
      "delegate",
      "planner",
      "researcher",
      "reviewer",
      "scout",
    ]);
  });
});

test("resolveAgentProfiles surfaces legacy warnings without loading legacy roles", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project");
    mkdirSync(cwd, { recursive: true });

    writeRole(path.join(cwd, ".codex", "config.toml"), "[agents.reviewer]\n");
    writeRole(path.join(cwd, ".codex", "agents", "reviewer.toml"), 'name = "reviewer"\n');
    writeRole(
      path.join(homeRoot, ".pi", "agent", "agents", "planner.md"),
      `---\nname: planner\ndescription: Legacy planner\n---\n\nLegacy prompt\n`,
    );

    const resolved = resolveAgentProfiles({ cwd });

    assert.match(resolved.warnings.join("\n"), /legacy Codex\/TOML subagent roles were detected/i);
    assert.match(resolved.warnings.join("\n"), /legacy ~\/\.pi\/agent\/agents roles were detected/i);
    assert.notEqual(resolved.profiles.get("planner")?.description, "Legacy planner");
  });
});
