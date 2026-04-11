import type { ChildProcessWithoutNullStreams } from "node:child_process";

import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const CODEX_SUBAGENT_TOOL_NAMES = [
  "spawn_agent",
  "send_input",
  "wait_agent",
  "close_agent",
] as const;
export const CODEX_SUBAGENT_RESERVED_TOOL_NAMES = [
  "spawn_agent",
  "send_input",
  "wait_agent",
  "close_agent",
] as const;
export const CODEX_SUBAGENT_CHILD_ENV = "PI_CODEX_SUBAGENT_CHILD";
export const CODEX_AGENT_PROFILE_NAME_ENV = "PI_CODEX_AGENT_PROFILE_NAME";
export const CODEX_AGENT_PROFILE_JSON_ENV = "PI_CODEX_AGENT_PROFILE_JSON";

export const PROJECT_ROOT = process.env.PI_CODEX_PROJECT_ROOT || process.cwd();
const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EXTENSION_ENTRY = path.join(EXTENSION_DIR, "..", "child-entry.ts");
export const RPC_COMMAND_TIMEOUT_MS = 5_000;
export const CHILD_EXIT_GRACE_MS = 1_000;
export const SUBAGENT_ENTRY_TYPES = {
  create: "codex-subagent:create",
  update: "codex-subagent:update",
  attach: "codex-subagent:attach",
  detach: "codex-subagent:detach",
  close: "codex-subagent:close",
} as const;

export type SubagentEntryType = (typeof SUBAGENT_ENTRY_TYPES)[keyof typeof SUBAGENT_ENTRY_TYPES];
export type DurableChildStatus = "live_running" | "live_idle" | "detached" | "failed" | "closed";
export type AgentToolStatus = "running" | "idle" | "detached" | "failed" | "closed" | "timeout";
export type PersistedTaskStatus = Exclude<AgentToolStatus, "timeout">;

export type PendingResponse = {
  resolve: (value: RpcResponse) => void;
  reject: (error: Error) => void;
};

export type DurableChildRecord = {
  agentId: string;
  agentType?: string;
  cwd: string;
  model?: string;
  name?: string;
  status: DurableChildStatus;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  sessionFile?: string;
  taskStatus?: PersistedTaskStatus;
  finalResultText?: string;
  lastAssistantText?: string;
  lastError?: string;
  closedAt?: string;
  parentSessionFile?: string;
};

export type LiveChildAttachment = {
  agentId: string;
  process: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stdoutDecoder: StringDecoder;
  stderr: string;
  nextCommandId: number;
  pendingResponses: Map<string, PendingResponse>;
  stateWaiters: Array<() => void>;
  operationQueue: Promise<void>;
  lastLiveAt: number;
  exitCode?: number | null;
  closingDisposition?: "detach" | "close" | "discard";
};

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
  agent_type?: string;
  status: AgentToolStatus;
  durable_status: DurableChildStatus;
  cwd: string;
  model?: string;
  name?: string;
  session_id?: string;
  session_file?: string;
  completion_version?: number;
  final_result_text?: string;
  last_assistant_text?: string;
  last_error?: string;
  exit_code?: number | null;
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
