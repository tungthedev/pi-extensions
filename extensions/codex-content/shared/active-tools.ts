import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { CODEX_WORKFLOW_TOOL_NAMES } from "../workflow/index.ts";

export const CODEX_COMPATIBILITY_TOOL_NAMES = [
  "read_file",
  "list_dir",
  "grep_files",
  "shell_command",
  "apply_patch",
  "view_image",
  ...CODEX_WORKFLOW_TOOL_NAMES,
] as const;

export function setActiveAvailableTools(pi: ExtensionAPI, toolNames: readonly string[]): void {
  const availableToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  pi.setActiveTools(toolNames.filter((toolName) => availableToolNames.has(toolName)));
}
