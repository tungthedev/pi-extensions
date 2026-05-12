import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCodexWorkflowTools } from "../workflow/index.js";
import { registerApplyPatchTool } from "./apply-patch.js";
import { registerFindFilesTool } from "./find-files.js";
import { registerGrepFilesTool } from "./grep-files.js";
import { registerListDirTool } from "./list-dir.js";
import { registerViewImageTool } from "./view-image.js";

export function registerCodexCompatibilityTools(pi: ExtensionAPI) {
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
} from "./list-dir.js";
export { findMatchingFiles, formatFindFilesOutput } from "./find-files.js";
export { findContentMatches, formatGrepFilesOutput } from "./grep-files.js";
export {
  execCommand,
  resolveAbsolutePath,
  resolveAbsolutePathWithVariants,
} from "./runtime.js";
