import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerDroidApplyPatchTool } from "./apply-patch.ts";
import { registerDroidAskUserTool } from "./ask-user.ts";
import { registerDroidCreateTool } from "./create.ts";
import { registerDroidEditTool } from "./edit.ts";
import { registerDroidExecuteTool } from "./execute.ts";
import { registerDroidGlobTool } from "./glob.ts";
import { registerDroidGrepTool } from "./grep.ts";
import { registerDroidListDirectoryTool } from "./list-directory.ts";
import { registerDroidPlanTool } from "./plan.ts";
import { registerDroidReadTool } from "./read.ts";
import { registerDroidSkillTool } from "./skill.ts";

export function registerDroidEasyTools(pi: ExtensionAPI): void {
  registerDroidReadTool(pi);
  registerDroidListDirectoryTool(pi);
  registerDroidGrepTool(pi);
  registerDroidGlobTool(pi);
  registerDroidCreateTool(pi);
  registerDroidEditTool(pi);
  registerDroidApplyPatchTool(pi);
  registerDroidAskUserTool(pi);
  registerDroidPlanTool(pi);
  registerDroidExecuteTool(pi);
  registerDroidSkillTool(pi);
}
