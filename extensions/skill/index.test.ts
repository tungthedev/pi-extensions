import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSkillsPromptInjection, createSkillTool, discoverAvailableSkills, findAvailableSkill } from "./index.ts";

function writeSkillFile(filePath: string, name: string, description: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );
}

test("discoverAvailableSkills follows documented skill discovery locations", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-skill-discovery-"));
  const home = path.join(root, "home");
  const agentDir = path.join(home, ".pi", "agent");
  const repoRoot = path.join(root, "repo");
  const cwd = path.join(repoRoot, "packages", "app");

  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  writeSkillFile(
    path.join(agentDir, "skills", "global-alpha", "SKILL.md"),
    "global-alpha",
    "Global skill",
  );
  writeSkillFile(
    path.join(home, ".agents", "skills", "global-beta", "SKILL.md"),
    "global-beta",
    "Home agents skill",
  );
  writeSkillFile(
    path.join(repoRoot, ".agents", "skills", "ancestor-gamma", "SKILL.md"),
    "ancestor-gamma",
    "Ancestor skill",
  );
  writeSkillFile(
    path.join(cwd, ".pi", "skills", "project-delta", "SKILL.md"),
    "project-delta",
    "Project skill",
  );
  writeSkillFile(
    path.join(home, ".pi", "shared-skills", "settings-epsilon.md"),
    "settings-epsilon",
    "Settings skill file",
  );
  writeFileSync(
    path.join(agentDir, "settings.json"),
    JSON.stringify({ skills: ["../shared-skills"] }, null, 2),
  );

  const previousHome = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const discovered = await discoverAvailableSkills({ cwd, agentDir });
    assert.deepEqual(
      discovered.skills.map((skill) => skill.name),
      ["ancestor-gamma", "global-alpha", "global-beta", "project-delta", "settings-epsilon"],
    );

    const ancestorSkill = await findAvailableSkill("ancestor-gamma", { cwd, agentDir });
    assert.equal(
      ancestorSkill?.filePath,
      path.join(repoRoot, ".agents", "skills", "ancestor-gamma", "SKILL.md"),
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildSkillsPromptInjection includes only skill name and description", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-list-skills-"));
  const home = path.join(root, "home");
  const agentDir = path.join(home, ".pi", "agent");
  const cwd = path.join(root, "workspace");

  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeSkillFile(
    path.join(agentDir, "skills", "review-helper", "SKILL.md"),
    "review-helper",
    "Helps review code",
  );

  const previousHome = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const { skills } = await discoverAvailableSkills({ cwd, agentDir });
    const injected = buildSkillsPromptInjection(skills);

    assert.match(injected, /<available_skills>/);
    assert.match(injected, /<skill name="review-helper">Helps review code<\/skill>/);
    assert.doesNotMatch(injected, /review-helper[\s\S]*SKILL\.md/);
    assert.doesNotMatch(injected, /base_dir/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("skill tool returns skill_details wrapper without arguments field", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-skill-tool-"));
  const home = path.join(root, "home");
  const agentDir = path.join(home, ".pi", "agent");
  const cwd = path.join(root, "workspace");

  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  writeSkillFile(
    path.join(agentDir, "skills", "review-helper", "SKILL.md"),
    "review-helper",
    "Helps review code",
  );

  const previousHome = process.env.HOME;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    const tool = createSkillTool();
    const result = await tool.execute("tool-call-1", { name: "review-helper" }, undefined, undefined, {
      cwd,
    } as never);

    const content = result.content?.[0];
    assert.equal(content?.type, "text");
    assert.match(content?.text ?? "", /^<skill_details name="review-helper">/);
    assert.doesNotMatch(content?.text ?? "", /^<loaded_skill/m);
    assert.match(content?.text ?? "", /Base directory for this skill:/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
