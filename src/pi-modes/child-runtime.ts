import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import registerCodexContentExtension from "../codex-content/index.ts";
import registerDroidContentExtension from "../droid-content/index.ts";
import registerShellExtension from "../shell/index.ts";
import registerSkillExtension from "../skill/index.ts";
import interactiveChild from "../subagents/subagents/interactive-child.ts";
import registerSystemMdExtension from "../system-md/index.ts";
import registerWebExtension from "../web/index.ts";

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
