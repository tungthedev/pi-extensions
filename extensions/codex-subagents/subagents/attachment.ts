import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

import type { LiveChildAttachment } from "./types.ts";
import {
  CODEX_AGENT_PROFILE_JSON_ENV,
  CODEX_AGENT_PROFILE_NAME_ENV,
  CODEX_SUBAGENT_CHILD_ENV,
  EXTENSION_ENTRY,
  PROJECT_ROOT,
} from "./types.ts";
import type { ChildProfileBootstrap } from "./profiles-apply.ts";

function resolveChildSessionDir(): string {
  const sessionDir = path.join(PROJECT_ROOT, ".pi", "subagents", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

export function appendBounded(current: string, chunk: string, max = 16 * 1024): string {
  const combined = `${current}${chunk}`;
  return combined.length <= max ? combined : combined.slice(combined.length - max);
}

export function createLiveAttachment(options: {
  agentId: string;
  cwd: string;
  model?: string;
  profileBootstrap?: ChildProfileBootstrap;
  sessionFile?: string;
}): LiveChildAttachment {
  const childSessionDir = resolveChildSessionDir();
  const args = ["--mode", "rpc"];

  if (options.sessionFile) {
    args.push("--session", options.sessionFile);
  }

  args.push("--session-dir", childSessionDir, "--no-extensions", "-e", EXTENSION_ENTRY);

  if (options.model && !options.sessionFile) {
    args.push("--model", options.model);
  }

  const child = spawn(process.env.PI_BINARY || "pi", args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      PI_CODEX_PROJECT_ROOT: PROJECT_ROOT,
      ...(options.profileBootstrap?.name
        ? { [CODEX_AGENT_PROFILE_NAME_ENV]: options.profileBootstrap.name }
        : {}),
      ...(options.profileBootstrap
        ? { [CODEX_AGENT_PROFILE_JSON_ENV]: JSON.stringify(options.profileBootstrap) }
        : {}),
      [CODEX_SUBAGENT_CHILD_ENV]: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  return {
    agentId: options.agentId,
    process: child,
    stdoutBuffer: "",
    stdoutDecoder: new StringDecoder("utf8"),
    stderr: "",
    nextCommandId: 1,
    pendingResponses: new Map(),
    stateWaiters: [],
    operationQueue: Promise.resolve(),
    lastLiveAt: Date.now(),
  };
}
