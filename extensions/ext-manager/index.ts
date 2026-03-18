import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { ExtensionManagerController } from "./controller/index.ts";
import { handleManagerAction, openManagerOverlay } from "./views/actions.ts";
import { buildRootView } from "./views/root.ts";

async function runExtensionManager(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!ctx.hasUI) {
    return;
  }

  const controller = new ExtensionManagerController(pi, ctx);
  await controller.refresh();

  while (true) {
    const action = await openManagerOverlay(ctx, buildRootView(controller));
    if (!action) return;
    const outcome = await handleManagerAction(action, controller, ctx);
    if (outcome === "done") return;
  }
}

export default function extensionManager(pi: ExtensionAPI) {
  pi.registerShortcut("ctrl+shift+e", {
    description: "Open extension manager",
    handler: async (ctx) => {
      if (!ctx.hasUI) return;
      pi.sendUserMessage("/extmgr", { deliverAs: "followUp" });
    },
  });

  pi.registerCommand("extmgr", {
    description: "Manage local and package-provided pi extensions",
    handler: async (_args, ctx) => {
      await runExtensionManager(pi, ctx);
    },
  });
}
