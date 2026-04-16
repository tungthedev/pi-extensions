import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { registerDroidSystemPrompt } from "./system-prompt.ts";
import { registerDroidEasyTools } from "./tools/index.ts";

async function applyDroidTools(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerDroidContentExtension(pi: ExtensionAPI) {
  registerDroidEasyTools(pi);
  registerDroidSystemPrompt(pi);

  pi.on("session_start", async (_event, ctx) => {
    await applyDroidTools(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await applyDroidTools(pi, ctx);
  });
}
