import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { registerShellTool } from "./tool.ts";

async function syncShellToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerShellExtension(pi: ExtensionAPI): void {
  registerShellTool(pi);

  pi.on("session_start", async (_event, ctx) => {
    await syncShellToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await syncShellToolSet(pi, ctx);
  });
}
