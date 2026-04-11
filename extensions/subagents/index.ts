/**
 * Adds persistent subagent tools for spawning and managing child agents.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { CODEX_SUBAGENT_CHILD_ENV, SUBAGENT_CHILD_ENV, registerSubagentTools } from "./subagents/index.ts";

export {
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  CODEX_SUBAGENT_TOOL_NAMES,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  SUBAGENT_TOOL_NAMES,
  registerCodexSubagentTools,
} from "./subagents/index.ts";

async function syncSubagentToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function subagentsExtension(pi: ExtensionAPI) {
  if (process.env[SUBAGENT_CHILD_ENV] !== "1" && process.env[CODEX_SUBAGENT_CHILD_ENV] !== "1") {
    registerSubagentTools(pi);

    pi.on("session_start", async (_event, ctx) => {
      await syncSubagentToolSet(pi, ctx);
    });

    pi.on("before_agent_start", async (_event, ctx) => {
      await syncSubagentToolSet(pi, ctx);
    });
  }
}
