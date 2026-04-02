import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../../settings/config.ts";
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

const FORGE_TOOL_SET_TOOL_NAMES = new Set([
  "shell",
  "fs_search",
  "patch",
  "followup",
  "todo_write",
  "todo_read",
]);

async function applyCompatibilityToolOverrides(pi: ExtensionAPI): Promise<void> {
  const settings = await readTungthedevSettings();
  if (settings.toolSet !== "codex") {
    return;
  }

  const activeToolNames = pi
    .getAllTools()
    .map((tool) => tool.name)
    .filter(
      (toolName) =>
        !REPLACED_BUILTIN_TOOL_NAMES.has(toolName) && !FORGE_TOOL_SET_TOOL_NAMES.has(toolName),
    );

  pi.setActiveTools(activeToolNames);
}

function registerToolOverrideHandlers(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    await applyCompatibilityToolOverrides(pi);
  });

  pi.on("session_switch", async () => {
    await applyCompatibilityToolOverrides(pi);
  });

  pi.on("before_agent_start", async () => {
    await applyCompatibilityToolOverrides(pi);
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
