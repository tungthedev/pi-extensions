import path from "node:path";

import { resolveRoleSet } from "./roles-discovery.ts";
import { loadBuiltinRoles } from "./roles-builtins.ts";
import type { AgentProfileConfig, AgentProfileSource, ResolvedAgentProfiles } from "./profiles-types.ts";
import { applySpawnAgentProfile, resolveRequestedAgentType } from "./profiles-apply.ts";

function normalizeThinkingToReasoningEffort(
  thinking: "minimal" | "low" | "medium" | "high" | "xhigh" | undefined,
): string | undefined {
  return thinking;
}

function toAgentProfile(role: {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  thinking?: "minimal" | "low" | "medium" | "high" | "xhigh";
  source: AgentProfileSource;
  filePath?: string;
}): AgentProfileConfig {
  return {
    name: role.name,
    description: role.description,
    developerInstructions: role.prompt,
    model: role.model,
    reasoningEffort: normalizeThinkingToReasoningEffort(role.thinking),
    available: true,
    source: role.source,
    sourcePath: role.filePath,
    visible: true,
  };
}

function formatProfile(profile: AgentProfileConfig): string {
  if (!profile.description) {
    return `${profile.name}: no description`;
  }
  return `${profile.name}: {\n${profile.description}\n}`;
}

export function buildSpawnAgentTypeDescription(resolvedProfiles: ResolvedAgentProfiles): string {
  return [
    `Optional type name for the new agent. If omitted, \`${resolvedProfiles.defaultRoleName}\` is used.`,
    "Available roles:",
    ...[...resolvedProfiles.profiles.values()].map(formatProfile),
  ].join("\n");
}

export function clearResolvedAgentProfilesCache(): void {
  // Resolution is intentionally uncached so external filesystem edits are reflected immediately.
}

function buildResolvedAgentProfiles(cwd: string): ResolvedAgentProfiles {
  const resolvedRoles = resolveRoleSet({ cwd });
  const profiles = new Map<string, AgentProfileConfig>();
  for (const role of resolvedRoles.effective.values()) {
    profiles.set(role.name, toAgentProfile(role));
  }

  return {
    defaultRoleName: "default",
    profiles,
    warnings: [...resolvedRoles.warnings],
  };
}

export function resolveBuiltInAgentProfiles(
  options: { includeHidden?: boolean } = {},
): ResolvedAgentProfiles {
  const profiles = new Map<string, AgentProfileConfig>();
  for (const role of loadBuiltinRoles()) {
    const profile = toAgentProfile(role);
    if (!options.includeHidden && !profile.visible) continue;
    profiles.set(profile.name, profile);
  }

  return {
    defaultRoleName: "default",
    profiles,
    warnings: [],
  };
}

export function loadCustomAgentProfiles(options: { cwd?: string } = {}): ResolvedAgentProfiles {
  const resolvedRoles = resolveRoleSet({ cwd: options.cwd ?? process.cwd() });
  const profiles = new Map<string, AgentProfileConfig>();
  for (const role of resolvedRoles.effective.values()) {
    if (role.source === "builtin") continue;
    profiles.set(role.name, toAgentProfile(role));
  }

  return {
    defaultRoleName: "default",
    profiles,
    warnings: [...resolvedRoles.warnings],
  };
}

export function resolveAgentProfiles(
  options: { includeHidden?: boolean; cwd?: string } = {},
): ResolvedAgentProfiles {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const resolved = buildResolvedAgentProfiles(cwd);

  if (options.includeHidden === true) {
    return {
      defaultRoleName: resolved.defaultRoleName,
      profiles: new Map(resolved.profiles),
      warnings: [...resolved.warnings],
    };
  }

  return {
    defaultRoleName: resolved.defaultRoleName,
    profiles: new Map([...resolved.profiles.entries()].filter(([, profile]) => profile.visible)),
    warnings: [...resolved.warnings],
  };
}

export type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles-types.ts";
export { applySpawnAgentProfile, resolveRequestedAgentType };
