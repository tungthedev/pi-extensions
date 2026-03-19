import type { AgentProfileConfig } from "./profiles-types.ts";

export type ChildProfileBootstrap = {
  name: string;
  developerInstructions?: string;
  model?: string;
  reasoningEffort?: string;
  source: AgentProfileConfig["source"];
};

export type AppliedSpawnProfile = {
  agentType: string;
  profile: AgentProfileConfig;
  effectiveModel?: string;
  effectiveReasoningEffort?: string;
  bootstrap: ChildProfileBootstrap;
};

export function resolveRequestedAgentType(agentType: string | undefined): string {
  const value = agentType?.trim();
  return value && value.length > 0 ? value : "default";
}

export function applySpawnAgentProfile(options: {
  requestedAgentType?: string;
  profiles: Map<string, AgentProfileConfig>;
  requestedModel?: string;
  requestedReasoningEffort?: string;
}): AppliedSpawnProfile {
  const agentType = resolveRequestedAgentType(options.requestedAgentType);
  const profile = options.profiles.get(agentType);
  if (!profile) {
    throw new Error(`unknown agent_type '${agentType}'`);
  }
  if (!profile.available) {
    throw new Error(profile.unavailableReason ?? "agent type is currently not available");
  }

  const effectiveModel = profile.lockedModel
    ? profile.model
    : options.requestedModel?.trim() || profile.model;
  const effectiveReasoningEffort = profile.lockedReasoningEffort
    ? profile.reasoningEffort
    : options.requestedReasoningEffort?.trim() || profile.reasoningEffort;

  return {
    agentType,
    profile,
    effectiveModel: effectiveModel || undefined,
    effectiveReasoningEffort: effectiveReasoningEffort || undefined,
    bootstrap: {
      name: profile.name,
      developerInstructions: profile.developerInstructions,
      model: profile.model,
      reasoningEffort: profile.reasoningEffort,
      source: profile.source,
    },
  };
}
