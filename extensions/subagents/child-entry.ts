import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";
import codexContent from "../codex-content/index.ts";
import droidContent from "../droid-content/index.ts";
import shell from "../shell/index.ts";
import skill from "../skill/index.ts";
import systemMd from "../system-md/index.ts";
import web from "../web/index.ts";

import { Type } from "@sinclair/typebox";

bootstrapSubagentCwd();

export default function codexChildEntry(pi: ExtensionAPI) {
  codexContent(pi);
  droidContent(pi);
  shell(pi);
  skill(pi);
  systemMd(pi);
  web(pi);

  pi.registerTool({
    name: "caller_update",
    label: "caller_update",
    description:
      "Send a short progress update to the parent session without exiting. Use this for long-running work when you are still making progress and want the parent to know what is happening. After calling it, continue working unless you are blocked.",
    parameters: Type.Object({
      message: Type.String({ description: "A brief progress update and what the parent should expect next" }),
    }),
    async execute(_toolCallId, params) {
      process.stdout.write(`${JSON.stringify({ type: "caller_update", message: params.message })}\n`);
      return {
        content: [{ type: "text", text: "Update sent. Continue working unless you need to stop." }],
        details: {},
      };
    },
  });
}
