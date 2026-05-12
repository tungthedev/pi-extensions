import type { ExtensionToolMetadata } from "../metadata-types.js";

export const GOAL_TOOL_NAMES = ["get_goal", "create_goal", "update_goal"] as const;

export const GOAL_TOOLS: ExtensionToolMetadata[] = GOAL_TOOL_NAMES.map((name) => ({
  name,
  source: "goal",
  capability: "workflow",
  mutates: name !== "get_goal",
}));
