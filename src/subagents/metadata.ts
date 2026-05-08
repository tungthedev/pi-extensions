import type { ExtensionToolMetadata } from "../metadata-types.js";

export const SUBAGENT_CODEX_TOOL_NAMES = [
  "spawn_agent",
  "send_message",
  "wait_agent",
  "list_agents",
  "close_agent",
] as const;

export const SUBAGENT_TOOLS: ExtensionToolMetadata[] = [
  { name: "spawn_agent", source: "subagents", capability: "subagents", mutates: true },
  { name: "send_message", source: "subagents", capability: "subagents", mutates: true },
  { name: "wait_agent", source: "subagents", capability: "subagents" },
  { name: "list_agents", source: "subagents", capability: "subagents" },
  { name: "close_agent", source: "subagents", capability: "subagents", mutates: true },
];
