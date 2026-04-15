import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveCodexConfigPath } from "../../shared/codex-config.ts";
import { loadBuiltinRoles } from "./roles-builtins.ts";
import { parseMarkdownRole } from "./roles-serializer.ts";
import type {
  EffectiveRoleRecord,
  LayeredRoleRecord,
  MarkdownRole,
  ResolvedRoleSet,
  RoleSource,
} from "./roles-types.ts";

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function listMarkdownFiles(dirPath: string): string[] {
  if (!isDirectory(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => path.join(dirPath, entry));
}

function loadRolesFromDir(dirPath: string, source: Exclude<RoleSource, "builtin">, warnings: string[]): MarkdownRole[] {
  return listMarkdownFiles(dirPath).flatMap((filePath) => {
    try {
      return [parseMarkdownRole(fs.readFileSync(filePath, "utf8"), filePath, source)];
    } catch (error) {
      warnings.push(
        `failed to load ${source} role '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  });
}

function configDeclaresLegacyRoles(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf8");
    return /^\[agents\.[^\]]+\]/m.test(content);
  } catch {
    return false;
  }
}

function collectLegacyCodexArtifacts(configPath: string): string[] {
  const hits: string[] = [];
  const configDir = path.dirname(configPath);
  const agentsDir = path.join(configDir, "agents");

  if (fs.existsSync(configPath) && configDeclaresLegacyRoles(configPath)) {
    hits.push(configPath);
  }
  if (isDirectory(agentsDir)) {
    for (const entry of fs.readdirSync(agentsDir).filter((name) => name.endsWith(".toml")).sort()) {
      hits.push(path.join(agentsDir, entry));
    }
  }

  return hits;
}

function discoverLegacyCodexArtifacts(cwd: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const hits = new Set<string>();
  let current = path.resolve(cwd);
  while (true) {
    const configPath = path.join(current, ".codex", "config.toml");
    for (const artifact of collectLegacyCodexArtifacts(configPath)) hits.add(artifact);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const resolvedConfigPath = resolveCodexConfigPath(env, resolveHomeDir());
  if (resolvedConfigPath) {
    for (const artifact of collectLegacyCodexArtifacts(resolvedConfigPath)) hits.add(artifact);
  }

  return [...hits].sort();
}

function resolveHomeDir(): string {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
}

function discoverLegacyUserRoles(): string[] {
  const legacyDir = path.join(resolveHomeDir(), ".pi", "agent", "agents");
  if (!isDirectory(legacyDir)) return [];
  return fs.readdirSync(legacyDir)
    .filter((entry) => entry.endsWith(".md") || entry.endsWith(".toml"))
    .sort()
    .map((entry) => path.join(legacyDir, entry));
}

export function resolveUserRolesDir(): string {
  return path.join(resolveHomeDir(), ".agents");
}

export function resolveNearestProjectRolesDir(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, ".agents");
    if (isDirectory(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function isProjectRootCandidate(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, ".git")) || fs.existsSync(path.join(dirPath, ".pi")) || fs.existsSync(path.join(dirPath, "package.json"));
}

export function resolveProjectRolesTargetDir(cwd: string): string | null {
  const existingDir = resolveNearestProjectRolesDir(cwd);
  if (existingDir) return existingDir;

  let current = path.resolve(cwd);
  while (true) {
    if (isProjectRootCandidate(current)) return path.join(current, ".agents");
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function discoverLegacyDotAgentsToml(dirPath: string | null): string[] {
  if (!dirPath || !isDirectory(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith(".toml"))
    .sort()
    .map((entry) => path.join(dirPath, entry));
}

export function resolveRoleSet(options: { cwd: string }): ResolvedRoleSet {
  const warnings: string[] = [];
  const userDir = resolveUserRolesDir();
  const projectDir = resolveNearestProjectRolesDir(options.cwd);
  const projectTargetDir = resolveProjectRolesTargetDir(options.cwd);

  const builtin = loadBuiltinRoles();
  const user = loadRolesFromDir(userDir, "user", warnings);
  const project = projectDir ? loadRolesFromDir(projectDir, "project", warnings) : [];

  const legacyCodexArtifacts = discoverLegacyCodexArtifacts(options.cwd);
  if (legacyCodexArtifacts.length > 0) {
    warnings.push(
      `legacy Codex/TOML subagent roles were detected and are no longer loaded. Move custom roles to ~/.agents/ or the nearest project .agents/ directory. Detected: ${legacyCodexArtifacts.join(", ")}`,
    );
  }

  const legacyUserRoles = discoverLegacyUserRoles();
  if (legacyUserRoles.length > 0) {
    warnings.push(
      `legacy ~/.pi/agent/agents roles were detected and are no longer loaded. Move custom roles to ~/.agents/ or the nearest project .agents/ directory. Detected: ${legacyUserRoles.join(", ")}`,
    );
  }

  const legacyDotAgentsToml = [
    ...discoverLegacyDotAgentsToml(userDir),
    ...discoverLegacyDotAgentsToml(projectDir ?? projectTargetDir),
  ];
  if (legacyDotAgentsToml.length > 0) {
    warnings.push(
      `legacy .agents/*.toml subagent roles were detected and are no longer loaded. Convert them to markdown roles in ~/.agents/ or the nearest project .agents/ directory. Detected: ${legacyDotAgentsToml.join(", ")}`,
    );
  }

  const effective = new Map<string, EffectiveRoleRecord>();
  for (const role of [...builtin, ...user, ...project]) {
    effective.set(role.name, { ...role, effectiveSource: role.source });
  }

  const builtinNames = new Set(builtin.map((role) => role.name));
  const layered: LayeredRoleRecord[] = [...builtin, ...user, ...project].map((role) => {
    const effectiveRole = effective.get(role.name);
    return {
      ...role,
      effectiveSource: effectiveRole?.source ?? role.source,
      overridesBuiltin: role.source !== "builtin" && builtinNames.has(role.name),
      shadowedBy: effectiveRole && effectiveRole.source !== role.source ? effectiveRole.source : undefined,
    };
  });

  return {
    layered,
    effective,
    warnings,
    userDir,
    projectDir,
    projectTargetDir,
  };
}
