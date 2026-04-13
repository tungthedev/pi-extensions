import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";
import codexContent from "../codex-content/index.ts";
import droidContent from "../droid-content/index.ts";
import shell from "../shell/index.ts";
import skill from "../skill/index.ts";
import systemMd from "../system-md/index.ts";
import web from "../web/index.ts";

import interactiveChild from "./subagents/interactive-child.ts";

bootstrapSubagentCwd();

function ensureSubagentDoneTool(
  pi: Pick<ExtensionAPI, "getAllTools" | "setActiveTools">,
  _ctx: Pick<ExtensionContext, "sessionManager">,
): void {
  const activeToolNames = pi
    .getAllTools()
    .map((tool) => tool.name)
    .filter((name) => name !== "subagent_done");
  activeToolNames.push("subagent_done");
  pi.setActiveTools(activeToolNames);
}

export default function interactiveChildEntry(pi: ExtensionAPI) {
  codexContent(pi);
  droidContent(pi);
  shell(pi);
  skill(pi);
  systemMd(pi);
  web(pi);
  interactiveChild(pi);

  pi.on("session_start", async (_event, ctx) => {
    ensureSubagentDoneTool(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    ensureSubagentDoneTool(pi, ctx);
  });
}
