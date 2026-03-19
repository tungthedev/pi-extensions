import type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles-types.ts";

import { applySpawnAgentProfile, resolveRequestedAgentType } from "./profiles-apply.ts";
import { parseBundledRoleAsset, resolveBuiltInAgentProfiles } from "./profiles-builtins.ts";
import { loadCustomAgentProfiles } from "./profiles-loader.ts";

let cachedAllProfiles: ResolvedAgentProfiles | undefined;

function buildLockedSettingsNote(profile: AgentProfileConfig): string {
  if (
    profile.lockedModel &&
    profile.model &&
    profile.lockedReasoningEffort &&
    profile.reasoningEffort
  ) {
    return `- This role's model is set to \`${profile.model}\` and its reasoning effort is set to \`${profile.reasoningEffort}\`. These settings cannot be changed.`;
  }
  if (profile.lockedModel && profile.model) {
    return `- This role's model is set to \`${profile.model}\` and cannot be changed.`;
  }
  if (profile.lockedReasoningEffort && profile.reasoningEffort) {
    return `- This role's reasoning effort is set to \`${profile.reasoningEffort}\` and cannot be changed.`;
  }
  return "";
}

function formatProfile(profile: AgentProfileConfig): string {
  if (!profile.description) {
    return `${profile.name}: no description`;
  }
  const lockedSettingsNote = buildLockedSettingsNote(profile);
  const body = lockedSettingsNote
    ? `${profile.description}\n${lockedSettingsNote}`
    : profile.description;
  return `${profile.name}: {\n${body}\n}`;
}

export function buildSpawnAgentTypeDescription(resolvedProfiles: ResolvedAgentProfiles): string {
  return [
    `Optional type name for the new agent. If omitted, \`${resolvedProfiles.defaultRoleName}\` is used.`,
    "Available roles:",
    ...[...resolvedProfiles.profiles.values()].map(formatProfile),
  ].join("\n");
}

export function clearResolvedAgentProfilesCache(): void {
  cachedAllProfiles = undefined;
}

function buildResolvedAgentProfiles(env: NodeJS.ProcessEnv = process.env): ResolvedAgentProfiles {
  const builtIns = resolveBuiltInAgentProfiles({ includeHidden: true });
  const custom = loadCustomAgentProfiles(env);
  const profiles = new Map<string, AgentProfileConfig>();

  for (const [name, profile] of custom.profiles) {
    profiles.set(name, profile);
  }

  for (const [name, profile] of builtIns.profiles) {
    if (!profiles.has(name)) {
      profiles.set(name, profile);
    }
  }

  return {
    defaultRoleName: "default",
    profiles,
    warnings: [...custom.warnings, ...builtIns.warnings],
  };
}

export function resolveAgentProfiles(
  options: { includeHidden?: boolean } = {},
): ResolvedAgentProfiles {
  cachedAllProfiles ??= buildResolvedAgentProfiles();
  if (options.includeHidden === true) {
    return {
      defaultRoleName: cachedAllProfiles.defaultRoleName,
      profiles: new Map(cachedAllProfiles.profiles),
      warnings: [...cachedAllProfiles.warnings],
    };
  }

  const visibleProfiles = new Map(
    [...cachedAllProfiles.profiles.entries()].filter(([, profile]) => profile.visible),
  );

  return {
    defaultRoleName: cachedAllProfiles.defaultRoleName,
    profiles: visibleProfiles,
    warnings: [...cachedAllProfiles.warnings],
  };
}

export type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles-types.ts";
export { parseBundledRoleAsset, resolveBuiltInAgentProfiles };
export { applySpawnAgentProfile, resolveRequestedAgentType };
export {
  discoverCodexRoleFiles,
  parseCodexRoleDeclarations,
  resolveCodexConfigPath,
} from "./profiles-codex-config.ts";
export { loadCustomAgentProfiles, parseCodexRoleFile } from "./profiles-loader.ts";
