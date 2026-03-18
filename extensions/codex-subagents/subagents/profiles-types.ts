export type AgentProfileSource = "builtin" | "codex-config" | "codex-agent-file";

export type AgentProfileConfig = {
  name: string;
  description?: string;
  developerInstructions?: string;
  nicknameCandidates?: string[];
  model?: string;
  reasoningEffort?: string;
  available: boolean;
  lockedModel: boolean;
  lockedReasoningEffort: boolean;
  source: AgentProfileSource;
  sourcePath?: string;
  unavailableReason?: string;
  visible: boolean;
};

export type ResolvedAgentProfiles = {
  defaultRoleName: "default";
  profiles: Map<string, AgentProfileConfig>;
  warnings: string[];
};
