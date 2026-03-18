import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { CODEX_COMPATIBILITY_TOOL_NAMES, setActiveAvailableTools } from "../shared/active-tools.ts";
import { registerCodexWorkflowTools } from "../workflow/index.ts";
import { registerApplyPatchTool } from "./apply-patch.ts";
import { registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";
import { registerReadFileTool } from "./read-file.ts";
import { registerShellCommandTool } from "./shell-command.ts";
import { registerViewImageTool } from "./view-image.ts";

export function registerCodexCompatibilityTools(pi: ExtensionAPI) {
  const applyActiveTools = () => {
    setActiveAvailableTools(pi, CODEX_COMPATIBILITY_TOOL_NAMES);
  };

  pi.on("session_start", async () => {
    applyActiveTools();
  });

  pi.on("before_agent_start", async () => {
    applyActiveTools();
  });

  registerCodexWorkflowTools(pi);

  registerReadFileTool(pi);
  registerListDirTool(pi);
  registerGrepFilesTool(pi);
  registerShellCommandTool(pi);
  registerApplyPatchTool(pi);
  registerViewImageTool(pi);
}
