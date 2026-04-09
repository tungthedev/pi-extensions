/**
 * Adds persistent subagent tools for spawning and managing child agents.
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { CODEX_SUBAGENT_CHILD_ENV, SUBAGENT_CHILD_ENV, registerSubagentTools } from "./subagents/index.ts";

export {
  AGENT_PROFILE_JSON_ENV,
  AGENT_PROFILE_NAME_ENV,
  applySpawnAgentProfile,
  buildSpawnAgentTypeDescription,
  buildSendInputContent,
  buildSpawnAgentContent,
  buildWaitAgentContent,
  clearResolvedAgentProfilesCache,
  CODEX_SUBAGENT_CHILD_ENV,
  CODEX_SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  CODEX_SUBAGENT_RESERVED_TOOL_NAMES,
  CODEX_SUBAGENT_TOOL_NAMES,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_NOTIFICATION_CUSTOM_TYPE,
  SUBAGENT_RESERVED_TOOL_NAMES,
  SUBAGENT_TOOL_NAMES,
  childSnapshot,
  deriveDurableStatusFromState,
  flattenCollabItems,
  generateUniqueSubagentName,
  getSubagentCompletionLabel,
  getSubagentDisplayName,
  getWaitAgentResultTitle,
  extractLastAssistantText,
  formatSubagentNotificationMessage,
  isResumable,
  MAX_SUBAGENT_REPLY_PREVIEW_LINES,
  MAX_SUBAGENT_NOTIFICATION_PREVIEW_CHARS,
  loadCustomAgentProfiles,
  parseCodexRoleDeclarations,
  parseCodexRoleFile,
  parseSubagentNotificationMessage,
  parseJsonLines,
  parseBundledRoleAsset,
  rebuildDurableRegistry,
  registerCodexSubagentTools,
  resolveAgentProfiles,
  resolveAgentIdAlias,
  resolveAgentIdsAlias,
  resolveParentSpawnDefaults,
  resolveBuiltInAgentProfiles,
  resolveCodexConfigPath,
  resolveRequestedAgentType,
  resolveForkContextSessionFile,
  resolveSubagentName,
  normalizeReasoningEffortToThinkingLevel,
  normalizeWaitAgentTimeoutMs,
  normalizeThinkingLevelToReasoningEffort,
  resolveSpawnPrompt,
  wrapInteractiveSpawnPrompt,
  summarizeSubagentReply,
  summarizeTaskRequest,
  truncateSubagentReply,
} from "./subagents/index.ts";

export type {
  AppliedSpawnProfile,
  AgentProfileConfig,
  AgentSnapshot,
  ChildProfileBootstrap,
  DurableChildRecord,
  LiveChildAttachment,
  ResolvedAgentProfiles,
} from "./subagents/index.ts";
export type { DurableChildStatus } from "./subagents/types.ts";

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
