import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../../shared/toolset-resolver.ts";
import { registerCodexWorkflowTools } from "../workflow/index.ts";
import { registerApplyPatchTool } from "./apply-patch.ts";
import { registerFindFilesTool } from "./find-files.ts";
import { registerGrepFilesTool } from "./grep-files.ts";
import { registerListDirTool } from "./list-dir.ts";
import { registerViewImageTool } from "./view-image.ts";

async function applyCompatibilityToolOverrides(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

function registerToolOverrideHandlers(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    await applyCompatibilityToolOverrides(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await applyCompatibilityToolOverrides(pi, ctx);
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
