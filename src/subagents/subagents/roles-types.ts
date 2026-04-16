export type RoleSource = "builtin" | "user" | "project";

export type RoleThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export type RoleDefinition = {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  thinking?: RoleThinkingLevel;
};

export type MarkdownRole = RoleDefinition & {
  filePath: string;
  source: RoleSource;
};

export type LayeredRoleRecord = MarkdownRole & {
  effectiveSource: RoleSource;
  overridesBuiltin: boolean;
  shadowedBy?: RoleSource;
};

export type EffectiveRoleRecord = MarkdownRole & {
  effectiveSource: RoleSource;
};

export type ResolvedRoleSet = {
  layered: LayeredRoleRecord[];
  effective: Map<string, EffectiveRoleRecord>;
  warnings: string[];
  userDir: string;
  projectDir: string | null;
  projectTargetDir: string | null;
};

export type SaveRoleInput = {
  cwd: string;
  scope: Exclude<RoleSource, "builtin">;
  role: RoleDefinition;
  overwrite?: boolean;
};

export type RenameRoleInput = {
  cwd: string;
  scope: Exclude<RoleSource, "builtin">;
  fromName: string;
  toName: string;
};

export type DeleteRoleInput = {
  cwd: string;
  scope: Exclude<RoleSource, "builtin">;
  name: string;
};

export type SavedRoleResult = MarkdownRole;
