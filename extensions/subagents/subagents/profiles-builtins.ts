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
    name: "delegate",
    description: [
      "Use `delegate` for lightweight delegated execution that should inherit the parent session's model and constraints.",
      "Delegate agents should stay direct, efficient, and focused on the assigned task.",
      "They are a good fit for prompt-driven delegation where you want a thin worker instead of a specialized role.",
    ].join("\n"),
    assetFile: "delegate.toml",
    visible: true,
  },
  {
    name: "planner",
    description: [
      "Use `planner` for implementation planning, task decomposition, and execution sequencing.",
      "Planner agents should analyze requirements, identify affected files and risks, and return a concrete plan instead of making changes.",
      "They are best for bounded planning work that will be executed by the parent or another agent.",
    ].join("\n"),
    assetFile: "planner.toml",
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
  {
    name: "reviewer",
    description: [
      "Use `reviewer` for code review, validation, and regression detection.",
      "Reviewer agents should prioritize bugs, risks, missing edge cases, and behavioral regressions over summaries.",
      "They are best for evaluative passes after implementation work or before a change is finalized.",
    ].join("\n"),
    assetFile: "reviewer.toml",
    visible: true,
  },
  {
    name: "scout",
    description: [
      "Use `scout` for fast codebase recon and compressed handoff context.",
      "Scout agents should search efficiently, identify the most relevant files and symbols, and summarize what matters without exhaustive analysis.",
      "They are a good first pass when the parent needs quick orientation before deeper work.",
    ].join("\n"),
    assetFile: "scout.toml",
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
  matchTomlStringArray(contents, "nickname_candidates");

  return {
    ...(developerInstructions ? { developerInstructions } : {}),
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
    model: parsed.model,
    reasoningEffort: parsed.reasoningEffort,
    available: true,
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
