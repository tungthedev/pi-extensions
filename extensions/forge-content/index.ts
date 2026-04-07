import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { resolveSessionToolSet } from "../settings/session.ts";
import { registerForgeResources } from "./resources/discover.ts";
import { handleForgeSystemPromptBeforeAgentStart } from "./system-prompt.ts";
import { registerForgeTools } from "./tools/index.ts";
import { registerForgeWorkflow } from "./workflow/index.ts";

const STATIC_FORGE_TOOL_SET = [
  "read",
  "write",
  "fs_search",
  "patch",
  "followup",
  "todos_write",
  "todos_read",
];

async function syncForgeToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  if ((await resolveSessionToolSet(ctx.sessionManager)) !== "forge") {
    return;
  }

  pi.setActiveTools(STATIC_FORGE_TOOL_SET);
}

export default function registerForgeContentExtension(pi: ExtensionAPI) {
  registerForgeResources(pi);
  registerForgeTools(pi);
  registerForgeWorkflow(pi);

  pi.on("session_start", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await syncForgeToolSet(pi, ctx);
    return handleForgeSystemPromptBeforeAgentStart(event, ctx, pi);
  });
}
