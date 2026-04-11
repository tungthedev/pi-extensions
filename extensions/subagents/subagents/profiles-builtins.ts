import fs from "node:fs";

import type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles-types.ts";
import {
  matchTomlString,
  matchTomlStringArray,
  matchTomlTripleQuotedString,
} from "../../shared/toml-lite.ts";

type BuiltInProfileDeclaration = {
  name: string;
  description?: string;
  assetFile?: string;
  visible: boolean;
};

type ParsedRoleAsset = {
  developerInstructions?: string;
  nicknameCandidates?: string[];
  model?: string;
  reasoningEffort?: string;
};

const BUILTIN_PROFILE_DECLARATIONS: BuiltInProfileDeclaration[] = [
  {
    name: "default",
    description: [
      "Use `default` for general-purpose delegated work that does not require a specialized research role.",
      "Default agents should complete the assigned task directly, follow the caller's scope closely, and avoid unrelated changes.",
      "They are the fallback choice for bounded implementation, execution, and synthesis tasks.",
    ].join("\n"),
    assetFile: "default.toml",
    visible: true,
  },
  {
    name: "researcher",
    description: [
      "Use `researcher` for deep codebase investigation and repository understanding.",
      "Researchers focus on evidence-backed findings and repository analysis.",
      "They should be used for bounded, read-heavy investigation tasks.",
      "Rules:",
      "- Prefer code tracing, architecture understanding, and evidence-backed findings.",
      "- Do not modify code unless the delegated instructions explicitly ask for it.",
      "- Keep findings concrete, scoped, and grounded in specific files or modules.",
    ].join("\n"),
    assetFile: "researcher.toml",
    visible: true,
  },
];

function readBundledRoleAsset(assetFile: string): string {
  return fs.readFileSync(new URL(`../assets/agents/${assetFile}`, import.meta.url), "utf8");
}

export function parseBundledRoleAsset(contents: string): ParsedRoleAsset {
  const developerInstructions =
    matchTomlTripleQuotedString(contents, "developer_instructions") ??
    matchTomlString(contents, "developer_instructions");
  const model = matchTomlString(contents, "model");
  const reasoningEffort = matchTomlString(contents, "model_reasoning_effort");
  const nicknameCandidates = matchTomlStringArray(contents, "nickname_candidates");

  return {
    ...(developerInstructions ? { developerInstructions } : {}),
    ...(nicknameCandidates ? { nicknameCandidates } : {}),
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function toBuiltInProfile(declaration: BuiltInProfileDeclaration): AgentProfileConfig {
  const parsed = declaration.assetFile
    ? parseBundledRoleAsset(readBundledRoleAsset(declaration.assetFile))
    : {};
  return {
    name: declaration.name,
    description: declaration.description,
    developerInstructions: parsed.developerInstructions,
    nicknameCandidates: parsed.nicknameCandidates,
    model: parsed.model,
    reasoningEffort: parsed.reasoningEffort,
    available: true,
    lockedModel: Boolean(parsed.model),
    lockedReasoningEffort: Boolean(parsed.reasoningEffort),
    source: "builtin",
    sourcePath: declaration.assetFile,
    visible: declaration.visible,
  };
}

export function resolveBuiltInAgentProfiles(
  options: { includeHidden?: boolean } = {},
): ResolvedAgentProfiles {
  const includeHidden = options.includeHidden === true;
  const profiles = new Map<string, AgentProfileConfig>();

  for (const declaration of BUILTIN_PROFILE_DECLARATIONS) {
    const profile = toBuiltInProfile(declaration);
    if (!includeHidden && !profile.visible) continue;
    profiles.set(profile.name, profile);
  }

  return {
    defaultRoleName: "default",
    profiles,
    warnings: [],
  };
}
