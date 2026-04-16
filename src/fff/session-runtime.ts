import path from "node:path";

import type { FinderOperationError, RuntimeInitializationError } from "../shared/fff/errors.ts";
import type { AppResult } from "../shared/fff/result-utils.ts";

import { FffRuntime } from "../shared/fff/runtime.ts";

const runtimeRegistry = new Map<string, FffRuntime>();

export type SessionKeyContext = {
  cwd: string;
  sessionManager?: {
    getSessionFile?: () => string | undefined;
  };
};

export function resolveSessionFffRuntimeKey(ctx: SessionKeyContext): string {
  const sessionFile = ctx.sessionManager?.getSessionFile?.();
  if (sessionFile) return `session:${sessionFile}`;
  return `cwd:${path.resolve(ctx.cwd)}`;
}

export function ensureSessionFffRuntime(sessionKey: string, cwd: string): FffRuntime {
  const existing = runtimeRegistry.get(sessionKey);
  if (existing) return existing;

  const runtime = new FffRuntime(cwd);
  runtimeRegistry.set(sessionKey, runtime);
  return runtime;
}

export function getSessionFffRuntime(sessionKey: string): FffRuntime | undefined {
  return runtimeRegistry.get(sessionKey);
}

export function disposeSessionFffRuntime(sessionKey: string): boolean {
  const runtime = runtimeRegistry.get(sessionKey);
  if (!runtime) return false;

  runtime.dispose();
  runtimeRegistry.delete(sessionKey);
  return true;
}

export async function getSessionFffStatus(
  sessionKey: string,
): Promise<
  | AppResult<
      { state: string; indexedFiles?: number; error?: string },
      RuntimeInitializationError | FinderOperationError
    >
  | undefined
> {
  const runtime = runtimeRegistry.get(sessionKey);
  if (!runtime) return undefined;
  return await runtime.getStatus();
}

export function getSessionFffRuntimeCount(): number {
  return runtimeRegistry.size;
}

export function setSessionFffRuntimeForTests(sessionKey: string, runtime: FffRuntime): void {
  const existing = runtimeRegistry.get(sessionKey);
  existing?.dispose();
  runtimeRegistry.set(sessionKey, runtime);
}

export function resetSessionFffRuntimesForTests(): void {
  for (const runtime of runtimeRegistry.values()) {
    runtime.dispose();
  }
  runtimeRegistry.clear();
}
