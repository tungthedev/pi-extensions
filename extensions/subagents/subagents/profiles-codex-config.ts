import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CodexDeclaredRole = {
  declaredName: string;
  description?: string;
  configFile?: string;
  nicknameCandidates?: string[];
};

function normalizeArrayItems(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
    .filter(Boolean);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchTomlString(section: string, key: string): string | undefined {
  const match = section.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1]?.trim();
}

function matchTomlStringArray(section: string, key: string): string[] | undefined {
  const match = section.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match?.[1]) return undefined;
  const values = normalizeArrayItems(match[1]);
  return values.length > 0 ? values : undefined;
}

export function resolveCodexConfigPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.PI_CODEX_CONFIG_PATH?.trim();
  if (explicit) return path.resolve(explicit);

  const codexHome = env.CODEX_HOME?.trim();
  if (codexHome) return path.resolve(codexHome, "config.toml");

  const home = env.HOME?.trim() || os.homedir();
  if (!home) return undefined;
  return path.join(home, ".codex", "config.toml");
}

export function parseCodexRoleDeclarations(contents: string): CodexDeclaredRole[] {
  const headerRegex = /^\[agents\.([^\]]+)\]\s*$/gm;
  const anyHeaderRegex = /^\[[^\]]+\]\s*$/gm;
  const matches = [...contents.matchAll(headerRegex)];
  const allHeaders = [...contents.matchAll(anyHeaderRegex)];
  const declarations: CodexDeclaredRole[] = [];

  for (const [_, match] of matches.entries()) {
    const declaredName = match[1]?.trim();
    if (!declaredName) continue;

    const sectionStart = (match.index ?? 0) + match[0].length;
    const sectionEnd =
      allHeaders.find((header) => (header.index ?? 0) > (match.index ?? 0))?.index ??
      contents.length;
    const section = contents.slice(sectionStart, sectionEnd);

    declarations.push({
      declaredName,
      description: matchTomlString(section, "description"),
      configFile: matchTomlString(section, "config_file"),
      nicknameCandidates: matchTomlStringArray(section, "nickname_candidates"),
    });
  }

  return declarations;
}

export function discoverCodexRoleFiles(configPath: string): string[] {
  const configDir = path.dirname(configPath);
  const agentsDir = path.join(configDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  return fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
    .map((entry) => path.join(agentsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}
