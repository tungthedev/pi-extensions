import type { ExtensionToolMetadata } from "../metadata-types.js";

export const CODEX_CONTENT_TOOL_NAMES = [
  "update_plan",
  "read_plan",
  "request_user_input",
  "list_dir",
  "find_files",
  "grep_files",
  "apply_patch",
  "view_image",
] as const;

export const CODEX_CONTENT_TOOLS: ExtensionToolMetadata[] = [
  { name: "update_plan", source: "codex-content", capability: "workflow", mutates: true },
  { name: "read_plan", source: "codex-content", capability: "workflow" },
  { name: "request_user_input", source: "codex-content", capability: "interaction" },
  { name: "list_dir", source: "codex-content", capability: "filesystem.read" },
  { name: "find_files", source: "codex-content", capability: "filesystem.read" },
  { name: "grep_files", source: "codex-content", capability: "filesystem.read" },
  { name: "apply_patch", source: "codex-content", capability: "filesystem.write", mutates: true },
  { name: "view_image", source: "codex-content", capability: "filesystem.read" },
];
