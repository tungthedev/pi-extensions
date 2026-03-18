import fs from "node:fs";
import path from "node:path";

import type { AgentProfileConfig } from "./profiles-types.ts";
import {
  discoverCodexRoleFiles,
  parseCodexRoleDeclarations,
  resolveCodexConfigPath,
  type CodexDeclaredRole,
} from "./profiles-codex-config.ts";

type ParsedCodexRoleFile = {
  name?: string;
  description?: string;
  nicknameCandidates?: string[];
  developerInstructions?: string;
  model?: string;
  reasoningEffort?: string;
};

export type LoadedCustomAgentProfiles = {
  profiles: Map<string, AgentProfileConfig>;
  warnings: string[];
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

function matchTomlTripleQuotedString(contents: string, key: string): string | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\"\"\"([\\s\\S]*?)\"\"\"`, "m"));
  return match?.[1]?.trim();
}

function matchTomlString(contents: string, key: string): string | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\"([^\"]*)\"`, "m"));
  return match?.[1]?.trim();
}

function matchTomlStringArray(contents: string, key: string): string[] | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match?.[1]) return undefined;
  const values = normalizeArrayItems(match[1]);
  return values.length > 0 ? values : undefined;
}

export function parseCodexRoleFile(contents: string): ParsedCodexRoleFile {
  return {
    name: matchTomlString(contents, "name"),
    description: matchTomlString(contents, "description"),
    nicknameCandidates: matchTomlStringArray(contents, "nickname_candidates"),
    developerInstructions:
      matchTomlTripleQuotedString(contents, "developer_instructions") ??
      matchTomlString(contents, "developer_instructions"),
    model: matchTomlString(contents, "model"),
    reasoningEffort: matchTomlString(contents, "model_reasoning_effort"),
  };
}

function insertWithWarning(
  profiles: Map<string, AgentProfileConfig>,
  warnings: string[],
  profile: AgentProfileConfig,
): void {
  if (profiles.has(profile.name)) {
    warnings.push(`duplicate custom agent role '${profile.name}' encountered; later definition won`);
    profiles.delete(profile.name);
  }
  profiles.set(profile.name, profile);
}

function toProfileFromDeclaration(options: {
  declaration: CodexDeclaredRole;
  configPath: string;
}): AgentProfileConfig {
  return {
    name: options.declaration.declaredName,
    description: options.declaration.description,
    nicknameCandidates: options.declaration.nicknameCandidates,
    available: true,
    lockedModel: false,
    lockedReasoningEffort: false,
    source: "codex-config",
    sourcePath: options.configPath,
    visible: true,
  };
}

function toProfileFromRoleFile(options: {
  roleFilePath: string;
  parsedRole: ParsedCodexRoleFile;
  fallbackName: string;
  fallbackDescription?: string;
  fallbackNicknameCandidates?: string[];
}): AgentProfileConfig {
  const name = options.parsedRole.name?.trim() || options.fallbackName;
  return {
    name,
    description: options.parsedRole.description ?? options.fallbackDescription,
    developerInstructions: options.parsedRole.developerInstructions,
    nicknameCandidates: options.parsedRole.nicknameCandidates ?? options.fallbackNicknameCandidates,
    model: options.parsedRole.model,
    reasoningEffort: options.parsedRole.reasoningEffort,
    available: true,
    lockedModel: Boolean(options.parsedRole.model),
    lockedReasoningEffort: Boolean(options.parsedRole.reasoningEffort),
    source: "codex-agent-file",
    sourcePath: options.roleFilePath,
    visible: true,
  };
}

function loadDeclaredRoles(configPath: string, warnings: string[]): LoadedCustomAgentProfiles {
  const profiles = new Map<string, AgentProfileConfig>();
  const configDir = path.dirname(configPath);
  const declaredRoleFilePaths = new Set<string>();
  const configContents = fs.readFileSync(configPath, "utf8");
  const declarations = parseCodexRoleDeclarations(configContents);

  for (const declaration of declarations) {
    if (!declaration.configFile) {
      insertWithWarning(profiles, warnings, toProfileFromDeclaration({ declaration, configPath }));
      continue;
    }

    const roleFilePath = path.resolve(configDir, declaration.configFile);
    declaredRoleFilePaths.add(roleFilePath);
    try {
      const parsedRole = parseCodexRoleFile(fs.readFileSync(roleFilePath, "utf8"));
      insertWithWarning(
        profiles,
        warnings,
        toProfileFromRoleFile({
          roleFilePath,
          parsedRole,
          fallbackName: declaration.declaredName,
          fallbackDescription: declaration.description,
          fallbackNicknameCandidates: declaration.nicknameCandidates,
        }),
      );
    } catch (error) {
      insertWithWarning(profiles, warnings, {
        name: declaration.declaredName,
        description: declaration.description,
        nicknameCandidates: declaration.nicknameCandidates,
        available: false,
        unavailableReason: "agent type is currently not available",
        lockedModel: false,
        lockedReasoningEffort: false,
        source: "codex-config",
        sourcePath: roleFilePath,
        visible: false,
      });
      warnings.push(
        `failed to load codex role file for '${declaration.declaredName}' from '${roleFilePath}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  for (const roleFilePath of discoverCodexRoleFiles(configPath)) {
    if (declaredRoleFilePaths.has(roleFilePath)) continue;
    try {
      const parsedRole = parseCodexRoleFile(fs.readFileSync(roleFilePath, "utf8"));
      const fallbackName = path.basename(roleFilePath, ".toml");
      insertWithWarning(
        profiles,
        warnings,
        toProfileFromRoleFile({
          roleFilePath,
          parsedRole,
          fallbackName,
        }),
      );
    } catch (error) {
      warnings.push(
        `failed to load discovered codex role file '${roleFilePath}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { profiles, warnings };
}

export function loadCustomAgentProfiles(env: NodeJS.ProcessEnv = process.env): LoadedCustomAgentProfiles {
  const configPath = resolveCodexConfigPath(env);
  if (!configPath || !fs.existsSync(configPath)) {
    return { profiles: new Map(), warnings: [] };
  }

  const warnings: string[] = [];
  try {
    return loadDeclaredRoles(configPath, warnings);
  } catch (error) {
    warnings.push(`failed to load codex config '${configPath}': ${error instanceof Error ? error.message : String(error)}`);
    return { profiles: new Map(), warnings };
  }
}
