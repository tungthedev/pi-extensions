import fs from "node:fs";

import type { AgentProfileConfig, ResolvedAgentProfiles } from "./profiles-types.ts";

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
    description: "Default agent.",
    visible: true,
  },
  {
    name: "explorer",
    description: [
      "Use `explorer` for specific codebase questions.",
      "Explorers are fast and authoritative.",
      "They must be used to ask specific, well-scoped questions on the codebase.",
      "Rules:",
      "- In order to avoid redundant work, you should avoid exploring the same problem that explorers have already covered. Typically, you should trust the explorer results without additional verification. You are still allowed to inspect the code yourself to gain the needed context!",
      "- You are encouraged to spawn multiple explorers in parallel when you have multiple distinct questions to ask about the codebase that can be answered independently.",
      "- Reuse existing explorers for related questions.",
    ].join("\n"),
    assetFile: "explorer.toml",
    visible: true,
  },
  {
    name: "worker",
    description: [
      "Use for execution and production work.",
      "Typical tasks:",
      "- Implement part of a feature",
      "- Fix tests or bugs",
      "- Split large refactors into independent chunks",
      "Rules:",
      "- Explicitly assign ownership of the task (files / responsibility).",
      "- Always tell workers they are not alone in the codebase and should adapt to concurrent changes instead of reverting others' work.",
    ].join("\n"),
    assetFile: "worker.toml",
    visible: true,
  },
  {
    name: "reviewer",
    description: [
      "Use `reviewer` for code review and change-risk assessment.",
      "Typical tasks:",
      "- Review diffs for correctness, regressions, and maintainability",
      "- Call out missing tests, edge cases, and rollout risks",
      "- Summarize actionable fixes in priority order",
      "Rules:",
      "- Focus on findings and concrete risks, not style nits unless they affect correctness or readability.",
      "- Cite file paths and explain why each issue matters.",
      "- If the change looks good, say so clearly and mention any residual risk.",
    ].join("\n"),
    assetFile: "reviewer.toml",
    visible: true,
  },
];

function readBundledRoleAsset(assetFile: string): string {
  return fs.readFileSync(new URL(`../assets/agents/${assetFile}`, import.meta.url), "utf8");
}

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
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"""([\\s\\S]*?)"""`, "m"));
  return match?.[1]?.trim();
}

function matchTomlSingleQuotedString(contents: string, key: string): string | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1]?.trim();
}

function matchTomlStringArray(contents: string, key: string): string[] | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match?.[1]) return undefined;
  const values = normalizeArrayItems(match[1]);
  return values.length > 0 ? values : undefined;
}

export function parseBundledRoleAsset(contents: string): ParsedRoleAsset {
  const developerInstructions =
    matchTomlTripleQuotedString(contents, "developer_instructions") ??
    matchTomlSingleQuotedString(contents, "developer_instructions");
  const model = matchTomlSingleQuotedString(contents, "model");
  const reasoningEffort = matchTomlSingleQuotedString(contents, "model_reasoning_effort");
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
