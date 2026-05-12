import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDroidApplyPatchTool } from "./apply-patch.js";
import { registerDroidAskUserTool } from "./ask-user.js";
import { registerDroidCreateTool } from "./create.js";
import { registerDroidEditTool } from "./edit.js";
import { registerDroidExecuteTool } from "./execute.js";
import { registerDroidGlobTool } from "./glob.js";
import { registerDroidGrepTool } from "./grep.js";
import { registerDroidListDirectoryTool } from "./list-directory.js";
import { registerDroidPlanTool } from "./plan.js";

export function registerDroidEasyTools(pi: ExtensionAPI): void {
  registerDroidListDirectoryTool(pi);
  registerDroidGrepTool(pi);
  registerDroidGlobTool(pi);
  registerDroidCreateTool(pi);
  registerDroidEditTool(pi);
  registerDroidApplyPatchTool(pi);
  registerDroidAskUserTool(pi);
  registerDroidPlanTool(pi);
  registerDroidExecuteTool(pi);
}
