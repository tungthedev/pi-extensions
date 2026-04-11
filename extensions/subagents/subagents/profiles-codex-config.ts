import fs from "node:fs";
import path from "node:path";

import {
  listTomlNamedTableSections,
  matchTomlString,
  matchTomlStringArray,
} from "../../shared/toml-lite.ts";

export { resolveCodexConfigPath } from "../../shared/codex-config.ts";

export type CodexDeclaredRole = {
  declaredName: string;
  description?: string;
  configFile?: string;
  nicknameCandidates?: string[];
};

export function parseCodexRoleDeclarations(contents: string): CodexDeclaredRole[] {
  return listTomlNamedTableSections(contents, "agents").map(({ name, body }) => ({
    declaredName: name,
    description: matchTomlString(body, "description"),
    configFile: matchTomlString(body, "config_file"),
    nicknameCandidates: matchTomlStringArray(body, "nickname_candidates"),
  }));
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
