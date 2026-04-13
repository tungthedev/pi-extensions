import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { resolveSkillContent } from "./resolve.ts";

async function createSkill(root: string, relativeDir: string, name: string) {
  const skillDir = join(root, relativeDir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`,
  );
  return skillDir;
}

test("resolveSkillContent rejects empty skill name", async () => {
  await assert.rejects(() => resolveSkillContent(""), /skill is required/);
});

test("resolveSkillContent rejects unknown skill", async () => {
  await assert.rejects(() => resolveSkillContent("nonexistent-skill-xyz"), /not found/);
});

test("resolveSkillContent resolves nested skills by short name when unique", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const skillDir = await createSkill(root, "superpowers/brainstorming", "brainstorming");

  const result = await resolveSkillContent("brainstorming", { searchPaths: [root] });

  assert.equal(result.skillDir, skillDir);
  assert.match(result.content, /name: brainstorming/);
});

test("resolveSkillContent resolves nested skills by canonical path", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const skillDir = await createSkill(root, "superpowers/writing-plans", "writing-plans");

  const result = await resolveSkillContent("superpowers/writing-plans", { searchPaths: [root] });

  assert.equal(result.skillDir, skillDir);
  assert.match(result.content, /name: writing-plans/);
});

test("resolveSkillContent rejects ambiguous short names", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  await createSkill(root, "superpowers/brainstorming", "brainstorming");
  await createSkill(root, "other/brainstorming", "brainstorming");

  await assert.rejects(
    () => resolveSkillContent("brainstorming", { searchPaths: [root] }),
    /ambiguous.*(superpowers\/brainstorming|other\/brainstorming).*(superpowers\/brainstorming|other\/brainstorming)/i,
  );
});

test("resolveSkillContent resolves nested skills under symlinked namespaces by short name", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-resolve-"));
  const namespaceRoot = await mkdtemp(join(tmpdir(), "skill-namespace-"));
  const skillDir = await createSkill(namespaceRoot, "brainstorming", "brainstorming");

  await symlink(namespaceRoot, join(root, "superpowers"));

  const result = await resolveSkillContent("brainstorming", { searchPaths: [root] });

  assert.equal(result.skillDir, join(root, "superpowers", "brainstorming"));
  assert.notEqual(result.skillDir, skillDir);
  assert.match(result.content, /name: brainstorming/);
});
