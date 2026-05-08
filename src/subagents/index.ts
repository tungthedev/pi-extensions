/**
 * Adds persistent subagent tools for spawning and managing child agents.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createSubagentRoleAutocompleteProvider } from "../editor/index.js";
import { registerSubagentsCommand } from "./commands.js";
import { resolveAgentProfileNames } from "./subagents/profiles.js";
import { SUBAGENT_CHILD_ENV, registerSubagentTools } from "./subagents/index.js";

export { SUBAGENT_CODEX_TOOL_NAMES } from "./metadata.js";

export {
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  CODEX_SUBAGENT_TOOL_NAMES,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  SUBAGENT_TOOL_NAMES,
  registerCodexSubagentTools,
} from "./subagents/index.js";

export interface SubagentsOptions {}

export function registerSubagentsExtension(pi: ExtensionAPI, _options: SubagentsOptions = {}) {
  if (process.env[SUBAGENT_CHILD_ENV] !== "1") {
    const subagentTools = registerSubagentTools(pi);
    registerSubagentsCommand(pi);

    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.addAutocompleteProvider(
        createSubagentRoleAutocompleteProvider({
          cwd: ctx.cwd,
          resolveRoleNames: ({ cwd }) => resolveAgentProfileNames({ cwd }),
        }),
      );
      subagentTools.refreshRoleDescriptions(ctx.cwd);
    });

    pi.on("before_agent_start", async (_event, ctx) => {
      subagentTools.refreshRoleDescriptions(ctx.cwd);
    });
  }
}

export default registerSubagentsExtension;
