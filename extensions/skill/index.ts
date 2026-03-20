import {
  DefaultPackageManager,
  SettingsManager,
  loadSkills,
  loadSkillsFromDir,
  parseFrontmatter,
  type ExtensionAPI,
  type ResourceDiagnostic,
  type Skill,
  type Theme,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { renderLines, titleLine } from "../codex-content/renderers/common.ts";

interface SkillEntry {
  name: string;
  filePath: string;
  baseDir: string;
}

type SkillParams = {
  name: string;
  arguments?: string;
};

type DiscoveredSkills = {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
};

type DiscoverSkillsOptions = {
  cwd?: string;
  agentDir?: string;
  argv?: string[];
};

type CliSkillOptions = {
  noSkills: boolean;
  skillPaths: string[];
};

function resolveHomeDir(): string {
  return process.env.HOME?.trim() || os.homedir();
}

function resolveAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (configured) {
    const homeDir = resolveHomeDir();
    return configured === "~" ? homeDir : configured.replace(/^~\//, `${homeDir}/`);
  }
  return path.join(resolveHomeDir(), ".pi", "agent");
}

function isUnderPath(target: string, root: string): boolean {
  const normalizedTarget = path.resolve(target);
  const normalizedRoot = path.resolve(root);
  if (normalizedTarget === normalizedRoot) return true;
  const prefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;
  return normalizedTarget.startsWith(prefix);
}

function parseCliSkillOptions(argv = process.argv.slice(2)): CliSkillOptions {
  const skillPaths: string[] = [];
  let noSkills = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-skills") {
      noSkills = true;
      continue;
    }
    if (arg === "--skill") {
      const next = argv[index + 1]?.trim();
      if (next) {
        skillPaths.push(next);
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--skill=")) {
      const value = arg.slice("--skill=".length).trim();
      if (value) skillPaths.push(value);
    }
  }

  return { noSkills, skillPaths };
}

function findGitRoot(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(currentDir, ".git"))) return currentDir;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return undefined;
    currentDir = parentDir;
  }
}

function collectAncestorAgentSkillDirs(cwd: string): string[] {
  const dirs: string[] = [];
  const gitRoot = findGitRoot(cwd);
  let currentDir = path.resolve(cwd);
  const filesystemRoot = path.parse(currentDir).root;
  const stopDir = gitRoot ?? filesystemRoot;

  while (true) {
    dirs.push(path.join(currentDir, ".agents", "skills"));
    if (currentDir === stopDir) break;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return dirs;
}

function loadOptionalSkillDir(dir: string, source: string): DiscoveredSkills {
  if (!fs.existsSync(dir)) {
    return { skills: [], diagnostics: [] };
  }
  return loadSkillsFromDir({ dir, source });
}

function mergeDiscoveredSkillSets(skillSets: DiscoveredSkills[]): DiscoveredSkills {
  const diagnostics: ResourceDiagnostic[] = [];
  const skills: Skill[] = [];
  const seenNames = new Map<string, Skill>();
  const seenRealPaths = new Set<string>();

  for (const skillSet of skillSets) {
    diagnostics.push(...skillSet.diagnostics);

    for (const skill of skillSet.skills) {
      let realPath = skill.filePath;
      try {
        realPath = fs.realpathSync(skill.filePath);
      } catch {
        realPath = skill.filePath;
      }

      if (seenRealPaths.has(realPath)) continue;

      const existing = seenNames.get(skill.name);
      if (existing) {
        diagnostics.push({
          type: "collision",
          message: `name "${skill.name}" collision`,
          path: skill.filePath,
          collision: {
            resourceType: "skill",
            name: skill.name,
            winnerPath: existing.filePath,
            loserPath: skill.filePath,
            winnerSource: existing.source,
            loserSource: skill.source,
          },
        });
        continue;
      }

      seenNames.set(skill.name, skill);
      seenRealPaths.add(realPath);
      skills.push(skill);
    }
  }

  return {
    skills: sortSkills(skills),
    diagnostics,
  };
}

function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.filePath.localeCompare(right.filePath),
  );
}

export async function discoverAvailableSkills(
  options: DiscoverSkillsOptions = {},
): Promise<DiscoveredSkills> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const agentDir = path.resolve(options.agentDir ?? resolveAgentDir());
  const cli = parseCliSkillOptions(options.argv);
  const skillSets: DiscoveredSkills[] = [];

  if (!cli.noSkills) {
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const packageManager = new DefaultPackageManager({ cwd, agentDir, settingsManager });
    const resolvedPaths = await packageManager.resolve();
    const enabledSkillResources = resolvedPaths.skills.filter((resource) => resource.enabled);

    const globalSkillsDir = path.join(agentDir, "skills");
    const projectSkillsDir = path.join(cwd, ".pi", "skills");
    const packageSkillPaths = enabledSkillResources
      .filter((resource) => resource.metadata.origin === "package")
      .map((resource) => resource.path);
    const configuredSkillPaths = enabledSkillResources
      .filter(
        (resource) =>
          resource.metadata.origin === "top-level" &&
          !isUnderPath(resource.path, globalSkillsDir) &&
          !isUnderPath(resource.path, projectSkillsDir),
      )
      .map((resource) => resource.path);

    if (fs.existsSync(globalSkillsDir)) {
      skillSets.push(
        loadSkills({ cwd, agentDir, skillPaths: [globalSkillsDir], includeDefaults: false }),
      );
    }
    skillSets.push(
      loadOptionalSkillDir(path.join(resolveHomeDir(), ".agents", "skills"), "global"),
    );
    if (fs.existsSync(projectSkillsDir)) {
      skillSets.push(
        loadSkills({ cwd, agentDir, skillPaths: [projectSkillsDir], includeDefaults: false }),
      );
    }
    for (const dir of collectAncestorAgentSkillDirs(cwd)) {
      skillSets.push(loadOptionalSkillDir(dir, "project"));
    }
    if (packageSkillPaths.length > 0) {
      skillSets.push(
        loadSkills({ cwd, agentDir, skillPaths: packageSkillPaths, includeDefaults: false }),
      );
    }
    if (configuredSkillPaths.length > 0) {
      skillSets.push(
        loadSkills({ cwd, agentDir, skillPaths: configuredSkillPaths, includeDefaults: false }),
      );
    }
  }

  if (cli.skillPaths.length > 0) {
    skillSets.push(
      loadSkills({ cwd, agentDir, skillPaths: cli.skillPaths, includeDefaults: false }),
    );
  }

  return mergeDiscoveredSkillSets(skillSets);
}

export async function findAvailableSkill(
  name: string,
  options: DiscoverSkillsOptions = {},
): Promise<SkillEntry | null> {
  const skill = (await discoverAvailableSkills(options)).skills.find(
    (entry) => entry.name === name,
  );
  if (!skill) return null;

  return {
    name: skill.name,
    filePath: skill.filePath,
    baseDir: skill.baseDir,
  };
}

async function listAvailableSkills(cwd: string): Promise<string[]> {
  return (await discoverAvailableSkills({ cwd })).skills.map((skill) => skill.name);
}

function collectSkillFiles(baseDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name !== "SKILL.md") {
        files.push(fullPath);
      }
    }
  }

  walk(baseDir);
  return files;
}

function formatToolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: {},
    isError: true,
  };
}

function formatSkillsList(skills: Skill[], diagnostics: ResourceDiagnostic[]): string {
  return JSON.stringify(
    {
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        source: skill.source,
        file_path: skill.filePath,
        base_dir: skill.baseDir,
        disable_model_invocation: skill.disableModelInvocation,
      })),
      diagnostics: diagnostics.map((diagnostic) => ({
        type: diagnostic.type,
        message: diagnostic.message,
        ...(diagnostic.path ? { path: diagnostic.path } : {}),
        ...(diagnostic.collision ? { collision: diagnostic.collision } : {}),
      })),
    },
    null,
    2,
  );
}

type ListSkillsPayload = {
  skills?: Array<{
    name?: string;
    file_path?: string;
  }>;
};

function parseListSkillsPayload(result: {
  content?: Array<{ type?: string; text?: string }>;
}): ListSkillsPayload {
  const content = result.content?.[0];
  if (!content || content.type !== "text" || !content.text) return {};

  try {
    return JSON.parse(content.text) as ListSkillsPayload;
  } catch {
    return {};
  }
}

function treeLine(theme: Pick<Theme, "fg">, text: string, branch: "mid" | "last"): string {
  const prefix = branch === "last" ? "└ " : "├ ";
  return `${theme.fg("dim", prefix)}${theme.fg("toolOutput", text)}`;
}

function skillTreeLine(
  theme: Pick<Theme, "fg">,
  skillName: string,
  filePath: string,
  branch: "mid" | "last",
): string {
  const prefix = branch === "last" ? "└ " : "├ ";
  return `${theme.fg("dim", prefix)}${theme.fg("accent", skillName)}${theme.fg("toolOutput", ` - ${filePath}`)}`;
}

export function buildListSkillsLines(
  theme: Theme,
  payload: ListSkillsPayload,
  expanded: boolean,
): string[] {
  const skills = (payload.skills ?? []).filter(
    (skill): skill is { name: string; file_path: string } =>
      typeof skill.name === "string" &&
      skill.name.length > 0 &&
      typeof skill.file_path === "string" &&
      skill.file_path.length > 0,
  );
  const title = [titleLine(theme, "text", "List Skills")];

  if (skills.length === 0) {
    title.push(treeLine(theme, "No skills found", "last"));
    return title;
  }

  const visibleCount = expanded ? skills.length : Math.min(skills.length, 2);
  const visibleSkills = skills.slice(0, visibleCount);
  const hiddenCount = skills.length - visibleSkills.length;

  for (const [index, skill] of visibleSkills.entries()) {
    const isLastVisibleRow = index === visibleSkills.length - 1 && hiddenCount === 0;
    title.push(
      skillTreeLine(theme, skill.name, skill.file_path, isLastVisibleRow ? "last" : "mid"),
    );
  }

  if (!expanded && hiddenCount > 0) {
    title.push(treeLine(theme, `... +${hiddenCount} more skills (Ctrl+O to expand)`, "last"));
  }

  return title;
}

export function createSkillTool(): ToolDefinition {
  return {
    name: "skill",
    label: "Load Skill",
    description:
      "Load a specialized skill that provides domain-specific instructions and workflows.\n\n" +
      "When you recognize that a task matches one of the available skills, use this tool " +
      "to load the full skill instructions.\n\n" +
      "The skill will inject detailed instructions, workflows, and access to bundled " +
      "resources (scripts, references, templates) into the conversation context.",
    parameters: Type.Object({
      name: Type.String({
        description: "The name of the skill to load (must match one of the available skills).",
      }),
      arguments: Type.Optional(
        Type.String({
          description: "Optional arguments to pass to the skill.",
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const params = rawParams as SkillParams;
      const skill = await findAvailableSkill(params.name, { cwd: ctx.cwd });

      if (!skill) {
        const available = await listAvailableSkills(ctx.cwd);
        const list = available.length > 0 ? `\n\navailable skills: ${available.join(", ")}` : "";
        return formatToolError(`skill "${params.name}" not found.${list}`);
      }

      let rawContent: string;
      try {
        rawContent = fs.readFileSync(skill.filePath, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolError(`failed to read skill file: ${message}`);
      }

      const { body } = parseFrontmatter(rawContent);
      const parts: string[] = [
        `<loaded_skill name="${skill.name}">`,
        body,
        "",
        `Base directory for this skill: file://${skill.baseDir}`,
        "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
      ];

      const skillFiles = collectSkillFiles(skill.baseDir);
      if (skillFiles.length > 0) {
        parts.push("", "<skill_files>");
        for (const filePath of skillFiles) {
          parts.push(`<file>${filePath}</file>`);
        }
        parts.push("</skill_files>");
      }

      parts.push("</loaded_skill>");

      return {
        content: [{ type: "text" as const, text: parts.join("\n") }],
        details: { header: skill.name },
      };
    },
    renderCall(rawArgs, theme) {
      const args = rawArgs as SkillParams;
      const name = args.name || "...";
      return new Text(
        theme.fg("dim", "using ") +
          theme.fg("toolTitle", theme.bold(name)) +
          theme.fg("dim", " skill"),
        0,
        0,
      );
    },
    renderResult(result) {
      const content = result.content?.[0];
      if (!content || content.type !== "text") {
        return new Text("(no output)", 0, 0);
      }
      if (content.text.startsWith("<loaded_skill")) {
        return new Text("skill loaded", 0, 0);
      }
      return undefined;
    },
  };
}

export function createListSkillsTool(): ToolDefinition {
  return {
    name: "list_skills",
    label: "List Skills",
    description:
      "List all skills discoverable from the current project and global Pi configuration.\n\n" +
      "Follows Pi's documented skill discovery rules, including global directories, project directories, " +
      "ancestor .agents/skills directories, package-provided skills, and settings-defined skill paths.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const { skills, diagnostics } = await discoverAvailableSkills({ cwd: ctx.cwd });
      return {
        content: [{ type: "text" as const, text: formatSkillsList(skills, diagnostics) }],
        details: {
          count: skills.length,
          diagnostics: diagnostics.length,
        },
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, options, theme) {
      return renderLines(
        buildListSkillsLines(theme, parseListSkillsPayload(result), options.expanded),
      );
    },
  };
}

export default function skillExtension(pi: ExtensionAPI) {
  pi.registerTool(createSkillTool());
  pi.registerTool(createListSkillsTool());
}
