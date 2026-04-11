import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function getSkillSearchPaths(): string[] {
  return [
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".config", "agents", "skills"),
    join(homedir(), ".pi", "agent", "skills"),
  ];
}

async function findSkillDirectory(skillName: string): Promise<string | undefined> {
  const searchPaths = getSkillSearchPaths();
  for (const basePath of searchPaths) {
    const skillDir = join(basePath, skillName);
    try {
      const s = await stat(skillDir);
      if (s.isDirectory()) return skillDir;
    } catch {
      // Skip missing candidates.
    }
  }

  return undefined;
}

async function readSkillContent(skillDir: string): Promise<string> {
  const skillFile = join(skillDir, "SKILL.md");
  try {
    return await readFile(skillFile, "utf8");
  } catch {
    throw new Error(`SKILL.md not found in skill directory: ${skillDir}`);
  }
}

export async function resolveSkillContent(skillName: string): Promise<{ content: string; skillDir: string }> {
  const trimmed = skillName.trim();
  if (!trimmed) throw new Error("skill is required");

  const skillDir = await findSkillDirectory(trimmed);
  if (!skillDir) {
    throw new Error(`Skill "${trimmed}" not found. Checked: ${getSkillSearchPaths().join(", ")}`);
  }

  const content = await readSkillContent(skillDir);
  return { content, skillDir };
}
