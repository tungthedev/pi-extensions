import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerApplyPatchTool } from "./apply-patch.js";
import { registerFindFilesTool } from "./find-files.js";
import { registerGrepFilesTool } from "./grep-files.js";
import { registerListDirTool } from "./list-dir.js";
import { registerViewImageTool } from "./view-image.js";
import { registerCodexPlanTools } from "./plan.js";
import { registerRequestUserInputTool } from "./request-user-input.js";

export function registerCodexCompatibilityTools(pi: ExtensionAPI) {
  registerCodexPlanTools(pi);
  registerRequestUserInputTool(pi)

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
