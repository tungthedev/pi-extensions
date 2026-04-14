import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { SlashCommandInfo } from "@mariozechner/pi-coding-agent";

import { resolveSkillContent } from "./resolve.ts";

async function createSkill(root: string, relativeDir: string, name: string) {
  const skillDir = join(root, relativeDir);
  await mkdir(skillDir, { recursive: true });
  const skillFile = join(skillDir, "SKILL.md");
  await writeFile(skillFile, `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`);
  return { skillDir, skillFile };
}

function createCommand(
  name: string,
  options: { source?: SlashCommandInfo["source"]; path: string; baseDir?: string },
): SlashCommandInfo {
  return {
    name,
    source: options.source ?? "skill",
    sourceInfo: {
      path: options.path,
      source: "local",
      scope: "user",
      origin: "top-level",
      baseDir: options.baseDir,
    },
  };
}

test("resolveSkillContent rejects empty skill name", async () => {
  await assert.rejects(() => resolveSkillContent("", { commands: [] }), /skill is required/);
});

test("resolveSkillContent rejects unknown skill", async () => {
  await assert.rejects(
    () => resolveSkillContent("nonexistent-skill-xyz", { commands: [] }),
    /not found in loaded Pi skills/,
  );
});

test("resolveSkillContent resolves an exact loaded skill command", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const { skillDir, skillFile } = await createSkill(root, "brainstorming", "brainstorming");

  const result = await resolveSkillContent("brainstorming", {
    commands: [createCommand("skill:brainstorming", { path: skillFile, baseDir: skillDir })],
  });

  assert.equal(result.skillDir, skillDir);
  assert.match(result.content, /name: brainstorming/);
});

test("resolveSkillContent ignores non-skill slash commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const { skillFile } = await createSkill(root, "brainstorming", "brainstorming");

  await assert.rejects(
    () => resolveSkillContent("brainstorming", {
      commands: [createCommand("skill:brainstorming", { source: "prompt", path: skillFile })],
    }),
    /not found in loaded Pi skills/,
  );
});

test("resolveSkillContent falls back to the SKILL.md parent directory when baseDir is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const { skillDir, skillFile } = await createSkill(root, "writing-plans", "writing-plans");

  const result = await resolveSkillContent("writing-plans", {
    commands: [createCommand("skill:writing-plans", { path: skillFile })],
  });

  assert.equal(result.skillDir, skillDir);
  assert.match(result.content, /name: writing-plans/);
});
