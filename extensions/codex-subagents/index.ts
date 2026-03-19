import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { CODEX_SUBAGENT_CHILD_ENV, registerCodexSubagentTools } from "./subagents/index.ts";

export {
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
  childSnapshot,
  deriveDurableStatusFromState,
  flattenCollabItems,
  generateUniqueSubagentName,
  getSubagentCompletionLabel,
  getSubagentDisplayName,
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
  normalizeThinkingLevelToReasoningEffort,
  resolveSpawnPrompt,
  summarizeSubagentReply,
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

export default function codexSubagents(pi: ExtensionAPI) {
  if (process.env[CODEX_SUBAGENT_CHILD_ENV] !== "1") {
    registerCodexSubagentTools(pi);
  }
}
