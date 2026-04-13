import type { ReadToolInput } from "@mariozechner/pi-coding-agent";

import { access } from "node:fs/promises";

import type { ResolvedPath } from "../types.ts";

import {
  ensureSessionFffRuntime,
  resolveSessionFffRuntimeKey,
  type SessionKeyContext,
} from "../../../fff/session-runtime.ts";
import { resolveAbsolutePathWithVariants } from "../../runtime-paths.ts";
import {
  AmbiguousPathError,
  EmptyPathQueryError,
  FinderOperationError,
  MissingPathError,
  RuntimeInitializationError,
} from "../errors.ts";
import { formatCandidateLines } from "../format.ts";

function isPathResolutionCandidate(pathValue: string): boolean {
  const trimmed = pathValue.trim();
  return trimmed.length > 0 && !trimmed.includes("*") && !trimmed.includes("?");
}

async function canUseNativeReadPath(cwd: string, pathValue: string): Promise<string | null> {
  try {
    const resolved = resolveAbsolutePathWithVariants(cwd, pathValue);
    await access(resolved);
    return resolved;
  } catch {
    return null;
  }
}

function locationToReadParams(
  resolution: ResolvedPath,
  offset: number | undefined,
  limit: number | undefined,
): Pick<ReadToolInput, "offset" | "limit"> {
  if (offset !== undefined || !resolution.location) return { offset, limit };

  if (resolution.location.type === "line") {
    return { offset: resolution.location.line, limit: limit ?? 80 };
  }
  if (resolution.location.type === "position") {
    return { offset: resolution.location.line, limit: limit ?? 80 };
  }

  const rangeSize = Math.max(1, resolution.location.end.line - resolution.location.start.line + 1);
  return { offset: resolution.location.start.line, limit: limit ?? Math.max(rangeSize, 20) };
}

function formatReadResolutionError(pathValue: string, error: unknown): string {
  if (AmbiguousPathError.is(error)) {
    return [
      `Could not resolve \"${pathValue}\" uniquely for read.`,
      "Top matches:",
      ...formatCandidateLines(error.candidates),
    ].join("\n");
  }
  if (EmptyPathQueryError.is(error) || MissingPathError.is(error)) {
    return error.message;
  }
  if (RuntimeInitializationError.is(error) || FinderOperationError.is(error)) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function resolveReadToolInput(
  params: ReadToolInput,
  ctx: SessionKeyContext,
): Promise<ReadToolInput> {
  if (!isPathResolutionCandidate(params.path)) return params;

  const nativePath = await canUseNativeReadPath(ctx.cwd, params.path);
  if (nativePath) {
    return { ...params, path: nativePath };
  }

  const sessionKey = resolveSessionFffRuntimeKey(ctx);
  const runtime = ensureSessionFffRuntime(sessionKey, ctx.cwd);
  const resolution = await runtime.resolvePath(params.path, { allowDirectory: false });
  if (resolution.isErr()) {
    if (
      RuntimeInitializationError.is(resolution.error) ||
      FinderOperationError.is(resolution.error)
    ) {
      return params;
    }
    throw new Error(formatReadResolutionError(params.path, resolution.error));
  }

  const locationParams = locationToReadParams(resolution.value, params.offset, params.limit);
  return {
    path: resolution.value.absolutePath,
    ...locationParams,
  };
}
