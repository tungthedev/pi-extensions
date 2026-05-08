import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import registerCodexContentExtension from "../codex-content/index.js";
import registerDroidContentExtension from "../droid-content/index.js";
import registerShellExtension from "../shell/index.js";
import registerSkillExtension from "../skill/index.js";
import { registerSubagentTools } from "../subagents/subagents/index.js";
import interactiveChild from "../subagents/subagents/interactive-child.js";
import registerSystemMdExtension from "../system-md/index.js";
import registerWebExtension from "../web/index.js";

function registerCallerUpdateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "caller_update",
    label: "caller_update",
    description:
      "Send a short progress update to the parent session without exiting. Use this for long-running work when you are still making progress and want the parent to know what is happening. After calling it, continue working unless you are blocked.",
    parameters: Type.Object({
      message: Type.String({
        description: "A brief progress update and what the parent should expect next",
      }),
    }),
    async execute(_toolCallId, params) {
      process.stdout.write(`${JSON.stringify({ type: "caller_update", message: params.message })}\n`);
      return {
        content: [
          { type: "text" as const, text: "Update sent. Continue working unless you need to stop." },
        ],
        details: {},
      };
    },
  });
}

function registerSharedChildRuntime(pi: ExtensionAPI): void {
  registerCodexContentExtension(pi);
  registerDroidContentExtension(pi);
  registerShellExtension(pi);
  registerSkillExtension(pi);
  registerSubagentTools(pi);
  registerSystemMdExtension(pi);
  registerWebExtension(pi);
}

export function registerPiModesChildRuntime(pi: ExtensionAPI): void {
  registerSharedChildRuntime(pi);
  registerCallerUpdateTool(pi);
}

export function registerPiModesInteractiveChildRuntime(pi: ExtensionAPI): void {
  registerSharedChildRuntime(pi);
  interactiveChild(pi);
}
