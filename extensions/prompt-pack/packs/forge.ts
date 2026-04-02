import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  getForgePromptContext,
  getSharedForgeRuntimeState,
  type ForgeRuntimeState,
} from "../../forge-content/runtime-state.ts";
import { buildForgePrompt } from "../../forge-content/prompt/build-system-prompt.ts";

export function buildSelectedForgePrompt(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: ForgeRuntimeState = getSharedForgeRuntimeState(),
): string {
  return buildForgePrompt(getForgePromptContext(pi, ctx, state));
}
