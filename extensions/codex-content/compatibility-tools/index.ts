import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCodexWorkflowTools } from "../workflow/index.ts";
import { registerApplyPatchTool } from "./apply-patch.ts";
import { registerFindFilesTool } from "./find-files.ts";
import { registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";
import { registerReadFileTool } from "./read-file.ts";
import { registerShellCommandTool } from "./shell-command.ts";
import { registerViewImageTool } from "./view-image.ts";

const REPLACED_BUILTIN_TOOL_NAMES = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "bash",
  "edit",
  "write",
]);

function applyCompatibilityToolOverrides(pi: ExtensionAPI): void {
  const activeToolNames = pi
    .getAllTools()
    .map((tool) => tool.name)
    .filter((toolName) => !REPLACED_BUILTIN_TOOL_NAMES.has(toolName));

  pi.setActiveTools(activeToolNames);
}

function registerToolOverrideHandlers(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    applyCompatibilityToolOverrides(pi);
  });

  pi.on("before_agent_start", async () => {
    applyCompatibilityToolOverrides(pi);
  });
}

export function registerCodexCompatibilityTools(pi: ExtensionAPI) {
  registerToolOverrideHandlers(pi);

  registerCodexWorkflowTools(pi);

  registerReadFileTool(pi);
  registerListDirTool(pi);
  registerFindFilesTool(pi);
  registerGrepFilesTool(pi);
  registerShellCommandTool(pi);
  registerApplyPatchTool(pi);
  registerViewImageTool(pi);
}
