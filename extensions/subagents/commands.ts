import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { openSubagentsManager } from "./ui/subagents-manager.ts";

function sendCommandMessage(
  pi: Pick<ExtensionAPI, "sendMessage">,
  content: string,
): void {
  pi.sendMessage(
    {
      customType: "subagents-command",
      content,
      display: true,
    },
    { deliverAs: "nextTurn" },
  );
}

export async function handleSubagentsCommand(
  ctx: ExtensionCommandContext,
  pi: Pick<ExtensionAPI, "sendMessage">,
): Promise<void> {
  if (!ctx.hasUI) {
    sendCommandMessage(pi, "# Subagents\n\n`/subagents` requires the interactive UI.");
    return;
  }

  await openSubagentsManager(ctx);
}

export function registerSubagentsCommand(
  pi: Pick<ExtensionAPI, "registerCommand" | "sendMessage">,
): void {
  pi.registerCommand("subagents", {
    description: "Open the subagents role manager",
    handler: async (_args, ctx) => {
      await handleSubagentsCommand(ctx, pi);
    },
  });
}
