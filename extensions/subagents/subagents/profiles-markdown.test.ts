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
} from "./profiles.ts";
import { saveRole } from "./roles-storage.ts";

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

test("resolveAgentProfiles uses cwd-aware project shadowing", async () => {
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
    const reviewer = resolved.profiles.get("reviewer");

    assert.equal(reviewer?.source, "project");
    assert.equal(reviewer?.description, "Project reviewer");
    assert.equal(reviewer?.developerInstructions, "Project prompt");
    assert.equal(reviewer?.model, "anthropic/claude-sonnet-4-5");
    assert.equal(reviewer?.reasoningEffort, "high");
  });
});

test("buildSpawnAgentTypeDescription reflects markdown roles for the active cwd", async () => {
  await withTempHome((homeRoot) => {
    const cwdA = path.join(homeRoot, "workspace", "project-a", "nested");
    const cwdB = path.join(homeRoot, "workspace", "project-b", "nested");
    mkdirSync(cwdA, { recursive: true });
    mkdirSync(cwdB, { recursive: true });

    writeRole(
      path.join(homeRoot, "workspace", "project-a", ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Delegate from project A\n---\n\nPrompt A\n`,
    );
    writeRole(
      path.join(homeRoot, "workspace", "project-b", ".agents", "delegate.md"),
      `---\nname: delegate\ndescription: Delegate from project B\n---\n\nPrompt B\n`,
    );

    const descriptionA = buildSpawnAgentTypeDescription(resolveAgentProfiles({ cwd: cwdA }));
    const descriptionB = buildSpawnAgentTypeDescription(resolveAgentProfiles({ cwd: cwdB }));

    assert.match(descriptionA, /Delegate from project A/);
    assert.doesNotMatch(descriptionA, /Delegate from project B/);
    assert.match(descriptionB, /Delegate from project B/);
    assert.doesNotMatch(descriptionB, /Delegate from project A/);
  });
});

test("applySpawnAgentProfile uses role defaults and explicit overrides without locking", () => {
  const applied = applySpawnAgentProfile({
    requestedAgentType: "reviewer",
    profiles: new Map([
      [
        "reviewer",
        {
          name: "reviewer",
          description: "Review code",
          developerInstructions: "Review prompt",
          model: "openai/gpt-5",
          reasoningEffort: "high",
          source: "user",
          sourcePath: "/tmp/reviewer.md",
          visible: true,
          available: true,
        },
      ],
    ]),
    requestedModel: "anthropic/claude-sonnet-4-5",
    requestedReasoningEffort: "low",
  });

  assert.equal(applied.agentType, "reviewer");
  assert.equal(applied.effectiveModel, "anthropic/claude-sonnet-4-5");
  assert.equal(applied.effectiveReasoningEffort, "low");
  assert.equal(applied.bootstrap.name, "reviewer");
  assert.equal(applied.bootstrap.developerInstructions, "Review prompt");
});

test("resolveAgentProfiles reflects role saves in the same cwd without manual cache clearing", async () => {
  await withTempHome((homeRoot) => {
    const cwd = path.join(homeRoot, "workspace", "project", "nested");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.join(homeRoot, "workspace", "project", ".agents"), { recursive: true });

    const initial = resolveAgentProfiles({ cwd, includeHidden: true });
    assert.equal(initial.profiles.has("reviewer-lite"), false);

    saveRole({
      cwd,
      scope: "project",
      role: {
        name: "reviewer-lite",
        description: "Reviewer lite",
        prompt: "Prompt",
      },
    });

    const updated = resolveAgentProfiles({ cwd, includeHidden: true });
    assert.equal(updated.profiles.get("reviewer-lite")?.description, "Reviewer lite");
  });
});

test("resolveAgentProfiles reflects external on-disk role edits in the same cwd", async () => {
  await withTempHome((homeRoot) => {
    const projectRoot = path.join(homeRoot, "workspace", "project");
    const cwd = path.join(projectRoot, "nested");
    const rolePath = path.join(projectRoot, ".agents", "reviewer.md");
    mkdirSync(path.dirname(rolePath), { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeRole(
      rolePath,
      `---\nname: reviewer\ndescription: First description\n---\n\nPrompt one\n`,
    );

    const first = resolveAgentProfiles({ cwd, includeHidden: true });
    assert.equal(first.profiles.get("reviewer")?.description, "First description");

    writeRole(
      rolePath,
      `---\nname: reviewer\ndescription: Second description\n---\n\nPrompt two\n`,
    );

    const second = resolveAgentProfiles({ cwd, includeHidden: true });
    assert.equal(second.profiles.get("reviewer")?.description, "Second description");
    assert.equal(second.profiles.get("reviewer")?.developerInstructions, "Prompt two");
  });
});
