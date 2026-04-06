import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../../settings/config.ts";
import { registerCodexWorkflowTools } from "../workflow/index.ts";
import { registerApplyPatchTool } from "./apply-patch.ts";
import { registerFindFilesTool } from "./find-files.ts";
import { registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";
import { registerViewImageTool } from "./view-image.ts";

const REPLACED_BUILTIN_TOOL_NAMES = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "edit",
  "write",
]);

const CODEX_TOOL_SET_TOOL_NAMES = new Set([
  "update_plan",
  "read_plan",
  "request_user_input",
  "list_dir",
  "find_files",
  "grep_files",
  "apply_patch",
  "view_image",
]);

const FORGE_TOOL_SET_TOOL_NAMES = new Set([
  "fs_search",
  "patch",
  "followup",
  "todos_write",
  "todos_read",
]);

export function syncCodexToolSet(
  allToolNames: string[],
  toolSet: string,
): string[] | undefined {
  if (toolSet === "forge") {
    return undefined;
  }

  const availableToolNames = Array.from(new Set(allToolNames));

  if (toolSet === "codex") {
    return availableToolNames.filter(
      (toolName) =>
        !REPLACED_BUILTIN_TOOL_NAMES.has(toolName) && !FORGE_TOOL_SET_TOOL_NAMES.has(toolName),
    );
  }

  return availableToolNames.filter(
    (toolName) =>
      !CODEX_TOOL_SET_TOOL_NAMES.has(toolName) && !FORGE_TOOL_SET_TOOL_NAMES.has(toolName),
  );
}

async function applyCompatibilityToolOverrides(pi: ExtensionAPI): Promise<void> {
  const settings = await readTungthedevSettings();
  const nextActiveTools = syncCodexToolSet(
    pi.getAllTools().map((tool) => tool.name),
    settings.toolSet,
  );

  if (!nextActiveTools) {
    return;
  }

  pi.setActiveTools(nextActiveTools);
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

  registerListDirTool(pi);
  registerFindFilesTool(pi);
  registerGrepFilesTool(pi);
  registerApplyPatchTool(pi);
  registerViewImageTool(pi);
}

export {
  formatListDirectoryOutput,
  listDirectoryEntries,
  scanDirectoryEntries,
} from "./list-dir.ts";
export { findMatchingFiles, formatFindFilesOutput } from "./find-files.ts";
export { findContentMatches, formatGrepFilesOutput } from "./grep-files.ts";
export {
  execCommand,
  resolveAbsolutePath,
  resolveAbsolutePathWithVariants,
} from "./runtime.ts";
