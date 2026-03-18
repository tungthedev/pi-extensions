import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_TOOL_NAMES,
  registerCodexSubagentTools,
} from "../subagents.ts";
import { CODEX_WORKFLOW_TOOL_NAMES, registerCodexWorkflowTools } from "../workflow/index.ts";
import { registerApplyPatchTool } from "./apply-patch.ts";
import { registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";
import { registerReadFileTool } from "./read-file.ts";
import { registerShellCommandTool } from "./shell-command.ts";
import { registerViewImageTool } from "./view-image.ts";

const BASE_ACTIVE_TOOLS = [
  "read_file",
  "list_dir",
  "grep_files",
  "shell_command",
  "apply_patch",
  "view_image",
  ...CODEX_WORKFLOW_TOOL_NAMES,
] as const;

function activeCodexTools(): string[] {
  if (process.env[CODEX_SUBAGENT_CHILD_ENV] === "1") {
    return [...BASE_ACTIVE_TOOLS];
  }

  return [...BASE_ACTIVE_TOOLS, ...CODEX_SUBAGENT_TOOL_NAMES];
}

export function registerCodexCompatibilityTools(pi: ExtensionAPI) {
  const applyActiveTools = () => {
    pi.setActiveTools(activeCodexTools());
  };

  pi.on("session_start", async () => {
    applyActiveTools();
  });

  pi.on("before_agent_start", async () => {
    applyActiveTools();
  });

  registerCodexWorkflowTools(pi);
  if (process.env[CODEX_SUBAGENT_CHILD_ENV] !== "1") {
    registerCodexSubagentTools(pi);
  }

  registerReadFileTool(pi);
  registerListDirTool(pi);
  registerGrepFilesTool(pi);
  registerShellCommandTool(pi);
  registerApplyPatchTool(pi);
  registerViewImageTool(pi);
}
