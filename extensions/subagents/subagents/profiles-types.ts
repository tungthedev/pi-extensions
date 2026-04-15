export type AgentProfileSource = "builtin" | "user" | "project";

export type AgentProfileConfig = {
  name: string;
  description?: string;
  developerInstructions?: string;
  model?: string;
  reasoningEffort?: string;
  available: true;
  source: AgentProfileSource;
  sourcePath?: string;
  visible: boolean;
};

export type ResolvedAgentProfiles = {
  defaultRoleName: "default";
  profiles: Map<string, AgentProfileConfig>;
  warnings: string[];
};
