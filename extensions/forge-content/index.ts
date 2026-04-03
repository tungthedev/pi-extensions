import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../settings/config.ts";
import { registerForgeResources } from "./resources/discover.ts";
import { registerForgeTools } from "./tools/index.ts";
import { registerForgeWorkflow } from "./workflow/index.ts";

const STATIC_FORGE_TOOL_SET = [
  "read",
  "write",
  "fs_search",
  "patch",
  "followup",
  "todo_write",
  "todo_read",
];

async function syncForgeToolSet(pi: ExtensionAPI): Promise<void> {
  const settings = await readTungthedevSettings();
  if (settings.toolSet !== "forge") {
    return;
  }

  pi.setActiveTools(STATIC_FORGE_TOOL_SET);
}

export default function registerForgeContentExtension(pi: ExtensionAPI) {
  registerForgeResources(pi);
  registerForgeTools(pi);
  registerForgeWorkflow(pi);

  pi.on("session_start", async () => {
    await syncForgeToolSet(pi);
  });

  pi.on("session_switch", async () => {
    await syncForgeToolSet(pi);
  });

  pi.on("before_agent_start", async () => {
    await syncForgeToolSet(pi);
  });
}
