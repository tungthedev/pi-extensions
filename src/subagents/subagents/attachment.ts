import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

import type { ChildProfileBootstrap } from "./profiles-apply.ts";
import type { RpcLiveChildAttachment } from "./types.ts";

import {
  EXTENSION_ENTRY,
  PROJECT_ROOT,
  SUBAGENT_CWD_ENV,
  SUBAGENT_CHILD_ENV,
  SUBAGENT_TASK_PATH_ENV,
  TOOL_SET_OVERRIDE_ENV,
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

function buildChildDeveloperInstructions(options: {
  developerInstructions?: string;
  taskPath?: string;
}): string {
  return [
    options.developerInstructions?.trim(),
    options.taskPath?.trim()
      ? `Your canonical task path is ${options.taskPath.trim()}. Other agents can address you by this path.`
      : undefined,
  ].filter(Boolean).join("\n\n");
}

export function createLiveAttachment(options: {
  agentId: string;
  cwd: string;
  model?: string;
  profileBootstrap?: ChildProfileBootstrap;
  taskPath?: string;
  sessionFile?: string;
  launchMode?: "fresh" | "fork" | "resume";
  toolSet?: "pi" | "codex" | "droid";
}): RpcLiveChildAttachment {
  const childSessionDir = resolveChildSessionDir();
  const args = ["--mode", "rpc"];

  if (options.sessionFile) {
    args.push("--session", options.sessionFile);
  }

  args.push("--session-dir", childSessionDir, "--no-extensions", "-e", EXTENSION_ENTRY);

  const launchMode = options.launchMode ?? (options.sessionFile ? "resume" : "fresh");

  if (options.model && launchMode !== "resume") {
    args.push("--model", options.model);
  }

  const developerInstructions = buildChildDeveloperInstructions({
    developerInstructions: options.profileBootstrap?.developerInstructions,
    taskPath: options.taskPath,
  });
  if (developerInstructions) {
    args.push("--append-system-prompt", developerInstructions);
  }

  const child = spawn(process.env.PI_BINARY || "pi", args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      PI_SUBAGENT_PROJECT_ROOT: PROJECT_ROOT,
      [SUBAGENT_CWD_ENV]: options.cwd,
      ...(options.taskPath ? { [SUBAGENT_TASK_PATH_ENV]: options.taskPath } : {}),
      ...(options.toolSet ? { [TOOL_SET_OVERRIDE_ENV]: options.toolSet } : {}),
      [SUBAGENT_CHILD_ENV]: "1",
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
