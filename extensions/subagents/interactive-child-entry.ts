import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import codexContent from "../codex-content/index.ts";
import { registerForgeSystemPrompt } from "../forge-content/system-prompt.ts";
import systemMd from "../system-md/index.ts";

import interactiveChild from "./subagents/interactive-child.ts";

export default function interactiveChildEntry(pi: ExtensionAPI) {
  codexContent(pi);
  registerForgeSystemPrompt(pi);
  systemMd(pi);
  interactiveChild(pi);
}
