import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { registerForgeResources } from "./resources/discover.ts";
import { handleForgeSystemPromptBeforeAgentStart } from "./system-prompt.ts";
import { registerForgeTools } from "./tools/index.ts";
import { registerForgeWorkflow } from "./workflow/index.ts";

async function syncForgeToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerForgeContentExtension(pi: ExtensionAPI) {
  registerForgeResources(pi);
  registerForgeTools(pi);
  registerForgeWorkflow(pi);

  pi.on("session_start", async (_event, ctx) => {
    await syncForgeToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    await syncForgeToolSet(pi, ctx);
    return handleForgeSystemPromptBeforeAgentStart(event, ctx, pi);
  });
}
