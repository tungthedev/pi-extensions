import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

import type { ChildProfileBootstrap } from "./profiles-apply.ts";
import type { RpcLiveChildAttachment } from "./types.ts";

import {
  AGENT_PROFILE_JSON_ENV,
  AGENT_PROFILE_NAME_ENV,
  EXTENSION_ENTRY,
  LEGACY_AGENT_PROFILE_JSON_ENV,
  LEGACY_AGENT_PROFILE_NAME_ENV,
  LEGACY_SUBAGENT_CHILD_ENV,
  PROJECT_ROOT,
  SUBAGENT_CHILD_ENV,
} from "./types.ts";

export function resolveChildSessionDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
): string {
  const home = env.HOME?.trim() || homeDir;
  const sessionDir = path.join(home, ".pi", "subagents", "sessions");
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
}): RpcLiveChildAttachment {
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
      PI_SUBAGENT_PROJECT_ROOT: PROJECT_ROOT,
      PI_CODEX_PROJECT_ROOT: PROJECT_ROOT,
      ...(options.profileBootstrap?.name
        ? {
            [AGENT_PROFILE_NAME_ENV]: options.profileBootstrap.name,
            [LEGACY_AGENT_PROFILE_NAME_ENV]: options.profileBootstrap.name,
          }
        : {}),
      ...(options.profileBootstrap
        ? {
            [AGENT_PROFILE_JSON_ENV]: JSON.stringify(options.profileBootstrap),
            [LEGACY_AGENT_PROFILE_JSON_ENV]: JSON.stringify(options.profileBootstrap),
          }
        : {}),
      [SUBAGENT_CHILD_ENV]: "1",
      [LEGACY_SUBAGENT_CHILD_ENV]: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  return {
    agentId: options.agentId,
    transport: "rpc",
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
