import type { ChildProcessWithoutNullStreams } from "node:child_process";

import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const SUBAGENT_TOOL_NAMES = [
  "spawn_agent",
  "send_message",
  "wait_agent",
  "close_agent",
] as const;
export const SUBAGENT_RESERVED_TOOL_NAMES = [
  "spawn_agent",
  "send_message",
  "wait_agent",
  "close_agent",
] as const;
export const SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";
export const LEGACY_SUBAGENT_CHILD_ENV = "PI_CODEX_SUBAGENT_CHILD";
export const AGENT_PROFILE_NAME_ENV = "PI_AGENT_PROFILE_NAME";
export const LEGACY_AGENT_PROFILE_NAME_ENV = "PI_CODEX_AGENT_PROFILE_NAME";
export const AGENT_PROFILE_JSON_ENV = "PI_AGENT_PROFILE_JSON";
export const LEGACY_AGENT_PROFILE_JSON_ENV = "PI_CODEX_AGENT_PROFILE_JSON";
export const TOOL_SET_OVERRIDE_ENV = "PI_SESSION_TOOL_SET";

export const CODEX_SUBAGENT_TOOL_NAMES = SUBAGENT_TOOL_NAMES;
export const CODEX_SUBAGENT_RESERVED_TOOL_NAMES = SUBAGENT_RESERVED_TOOL_NAMES;
export const CODEX_SUBAGENT_CHILD_ENV = LEGACY_SUBAGENT_CHILD_ENV;
export const CODEX_AGENT_PROFILE_NAME_ENV = LEGACY_AGENT_PROFILE_NAME_ENV;
export const CODEX_AGENT_PROFILE_JSON_ENV = LEGACY_AGENT_PROFILE_JSON_ENV;

export const PROJECT_ROOT =
  process.env.PI_SUBAGENT_PROJECT_ROOT || process.env.PI_CODEX_PROJECT_ROOT || process.cwd();
const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_ENTRY = path.join(EXTENSION_DIR, "..", "child-entry.ts");
export const INTERACTIVE_EXTENSION_ENTRY = path.join(
  EXTENSION_DIR,
  "..",
  "interactive-child-entry.ts",
);
export const INTERACTIVE_LAUNCHER_ENTRY = path.join(
  EXTENSION_DIR,
  "..",
  "interactive-launcher.mjs",
);
export const RPC_COMMAND_TIMEOUT_MS = 5_000;
export const CHILD_EXIT_GRACE_MS = 1_000;
export const SUBAGENT_ENTRY_TYPES = {
  create: "subagent:create",
  update: "subagent:update",
  attach: "subagent:attach",
  detach: "subagent:detach",
  close: "subagent:close",
} as const;

export const LEGACY_SUBAGENT_ENTRY_TYPES = {
  create: "codex-subagent:create",
  update: "codex-subagent:update",
  attach: "codex-subagent:attach",
  detach: "codex-subagent:detach",
  close: "codex-subagent:close",
} as const;

export type SubagentEntryType =
  | (typeof SUBAGENT_ENTRY_TYPES)[keyof typeof SUBAGENT_ENTRY_TYPES]
  | (typeof LEGACY_SUBAGENT_ENTRY_TYPES)[keyof typeof LEGACY_SUBAGENT_ENTRY_TYPES];
export type ChildTransport = "rpc" | "interactive";
export type DurableChildStatus = "live_running" | "live_idle" | "detached" | "failed" | "closed";
export type AgentToolStatus = "running" | "idle" | "detached" | "failed" | "closed" | "timeout";

export type PendingResponse = {
  resolve: (value: RpcResponse) => void;
  reject: (error: Error) => void;
};

export type DurableChildRecord = {
  agentId: string;
  transport: ChildTransport;
  agentType?: string;
  cwd: string;
  model?: string;
  name?: string;
  status: DurableChildStatus;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  sessionFile?: string;
  lastAssistantText?: string;
  lastError?: string;
  taskSummary?: string;
  closedAt?: string;
  parentSessionFile?: string;
};

export type BaseLiveChildAttachment = {
  agentId: string;
  transport: ChildTransport;
  stateWaiters: Array<() => void>;
  operationQueue: Promise<void>;
  lastLiveAt: number;
  exitCode?: number | null;
  closingDisposition?: "detach" | "close" | "discard";
};

export type RpcLiveChildAttachment = BaseLiveChildAttachment & {
  transport: "rpc";
  process: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stdoutDecoder: StringDecoder;
  stderr: string;
  nextCommandId: number;
  pendingResponses: Map<string, PendingResponse>;
};

export type InteractiveLiveChildAttachment = BaseLiveChildAttachment & {
  transport: "interactive";
  surface: string;
  sessionFile: string;
  abortController: AbortController;
  detachPersisted?: boolean;
};

export type LiveChildAttachment = RpcLiveChildAttachment | InteractiveLiveChildAttachment;

export type RpcResponse = {
  type: "response";
  id?: string;
  command?: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export type AgentSnapshot = {
  agent_id: string;
  transport?: ChildTransport;
  agent_type?: string;
  status: AgentToolStatus;
  durable_status: DurableChildStatus;
  cwd: string;
  model?: string;
  name?: string;
  session_id?: string;
  session_file?: string;
  last_assistant_text?: string;
  last_error?: string;
  exit_code?: number | null;
};

export type PublicAgentSnapshot = Omit<AgentSnapshot, "agent_id" | "name"> & {
  name: string;
};

export type RegistryEntryPayload = {
  record: DurableChildRecord;
  reason?: string;
};

export type SessionEntryLike = {
  type?: unknown;
  customType?: unknown;
  data?: unknown;
};
