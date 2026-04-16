import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { formatToolSetLabel, type ToolSetPack } from "./config.ts";

export type ToolSetTransitionDeps = {
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeSessionToolSet?: (value: ToolSetPack) => Promise<void> | void;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
};

export type SessionToolSetTransitionDeps = {
  writeSessionToolSet: (value: ToolSetPack) => Promise<void> | void;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
};

async function notifyToolSetTransition(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  toolSet: ToolSetPack,
): Promise<void> {
  if (ctx.hasUI) {
    ctx.ui.notify(`Mode: ${formatToolSetLabel(toolSet)}`, "info");
  }
}

export async function applyToolSetTransition(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: ToolSetTransitionDeps,
  toolSet: ToolSetPack,
): Promise<void> {
  await deps.writeToolSet(toolSet);
  await deps.writeSessionToolSet?.(toolSet);
  await deps.emitToolSetChange?.(toolSet);
  await notifyToolSetTransition(ctx, toolSet);
}

export async function applySessionToolSetTransition(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: SessionToolSetTransitionDeps,
  toolSet: ToolSetPack,
): Promise<void> {
  await deps.writeSessionToolSet(toolSet);
  await deps.emitToolSetChange?.(toolSet);
  await notifyToolSetTransition(ctx, toolSet);
}
