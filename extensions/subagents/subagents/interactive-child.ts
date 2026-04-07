import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function interactiveChild(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent_done",
    label: "subagent_done",
    description:
      "Call this tool when you have completed your task and want to return control to the parent session.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      ctx.shutdown();
      return {
        content: [{ type: "text", text: "Shutting down subagent session." }],
        details: {},
      };
    },
  });
}
