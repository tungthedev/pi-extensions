import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";

type ResolveSkillOptions = {
  searchPaths?: string[];
};

type DiscoveredSkill = {
  canonicalName: string;
  leafName: string;
  skillDir: string;
};

export function getSkillSearchPaths(): string[] {
  return [
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".config", "agents", "skills"),
    join(homedir(), ".pi", "agent", "skills"),
  ];
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findDirectSkillDirectory(skillName: string, searchPaths: string[]): Promise<string | undefined> {
  for (const basePath of searchPaths) {
    const skillDir = join(basePath, skillName);
    if (await pathIsDirectory(skillDir)) return skillDir;
  }

  return undefined;
}

async function discoverSkills(searchPaths: string[]): Promise<DiscoveredSkill[]> {
  const discovered: DiscoveredSkill[] = [];

  async function walk(root: string, dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      discovered.push({
        canonicalName: relative(root, dir).replaceAll("\\", "/"),
        leafName: basename(dir),
        skillDir: dir,
      });
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const childPath = join(dir, entry.name);
      if (entry.isDirectory() || (entry.isSymbolicLink() && (await pathIsDirectory(childPath)))) {
        await walk(root, childPath);
      }
    }
  }

  for (const root of searchPaths) {
    if (!(await pathIsDirectory(root))) continue;
    await walk(root, root);
  }

  return discovered;
}

async function findSkillDirectory(skillName: string, searchPaths: string[]): Promise<string | undefined> {
  const directMatch = await findDirectSkillDirectory(skillName, searchPaths);
  if (directMatch) return directMatch;

  const discovered = await discoverSkills(searchPaths);
  const matches = discovered.filter((skill) => skill.canonicalName === skillName || skill.leafName === skillName);

  if (matches.length === 1) return matches[0]?.skillDir;
  if (matches.length > 1) {
    const names = matches.map((skill) => skill.canonicalName).sort().join(", ");
    throw new Error(`Skill "${skillName}" is ambiguous. Matches: ${names}`);
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

export async function resolveSkillContent(
  skillName: string,
  options: ResolveSkillOptions = {},
): Promise<{ content: string; skillDir: string }> {
  const trimmed = skillName.trim();
  if (!trimmed) throw new Error("skill is required");

  const searchPaths = options.searchPaths ?? getSkillSearchPaths();
  const skillDir = await findSkillDirectory(trimmed, searchPaths);
  if (!skillDir) {
    throw new Error(`Skill "${trimmed}" not found. Checked: ${searchPaths.join(", ")}`);
  }

  const content = await readSkillContent(skillDir);
  return { content, skillDir };
}
