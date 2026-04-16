import type { ToolSetPack } from "../settings/config.ts";

export type ToolsetModeId = ToolSetPack;

export type ToolAvailability = "required" | "optional";

export type ToolsetToolDefinition = {
  name: string;
  availability: ToolAvailability;
};

export type ToolsetContribution = {
  extension: string;
  tools: readonly ToolsetToolDefinition[];
};

export type ToolsetConflictRule = {
  owner: string;
  when: readonly ToolsetModeId[];
  hides: readonly string[];
};

export type RegisteredToolInfo = {
  name: string;
  description: string;
};

export type ResolvedToolsetEntry = RegisteredToolInfo & {
  availability: ToolAvailability;
};
