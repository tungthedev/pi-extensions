import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerForgeFollowupTool } from "./followup.ts";
import { registerForgeFsSearchTool } from "./fs-search.ts";
import { registerForgePatchTool } from "./patch.ts";
import { registerForgeShellTool } from "./shell.ts";

export function registerForgeTools(pi: ExtensionAPI): void {
  registerForgeShellTool(pi);
  registerForgeFsSearchTool(pi);
  registerForgePatchTool(pi);
  registerForgeFollowupTool(pi);
}
