import type { ExtensionToolMetadata } from "../metadata-types.js";

export const DROID_CONTENT_TOOL_NAMES = [
  "LS",
  "Grep",
  "Glob",
  "Create",
  "Edit",
  "ApplyPatch",
  "AskUser",
  "TodoWrite",
  "Execute",
] as const;

export const DROID_CONTENT_TOOLS: ExtensionToolMetadata[] = [
  { name: "LS", source: "droid-content", capability: "filesystem.read" },
  { name: "Grep", source: "droid-content", capability: "filesystem.read" },
  { name: "Glob", source: "droid-content", capability: "filesystem.read" },
  { name: "Create", source: "droid-content", capability: "filesystem.write", mutates: true },
  { name: "Edit", source: "droid-content", capability: "filesystem.write", mutates: true },
  { name: "ApplyPatch", source: "droid-content", capability: "filesystem.write", mutates: true },
  { name: "AskUser", source: "droid-content", capability: "interaction" },
  { name: "TodoWrite", source: "droid-content", capability: "workflow", mutates: true },
  { name: "Execute", source: "droid-content", capability: "subprocess", mutates: true },
];
