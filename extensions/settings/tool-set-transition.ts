import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { formatToolSetLabel, type ToolSetPack } from "./config.ts";

export type ToolSetTransitionDeps = {
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeSessionToolSet?: (value: ToolSetPack) => Promise<void> | void;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
};

export async function applyToolSetTransition(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: ToolSetTransitionDeps,
  toolSet: ToolSetPack,
): Promise<void> {
  await deps.writeToolSet(toolSet);
  await deps.writeSessionToolSet?.(toolSet);
  await deps.emitToolSetChange?.(toolSet);

  if (ctx.hasUI) {
    ctx.ui.notify(`Mode: ${formatToolSetLabel(toolSet)}`, "info");
  }
}
