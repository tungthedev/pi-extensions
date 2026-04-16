import path from "node:path";

import type { SessionKeyContext } from "../../../fff/session-runtime.ts";
import type { FffRuntime } from "../runtime.ts";

import {
  ensureSessionFffRuntime,
  resolveSessionFffRuntimeKey,
} from "../../../fff/session-runtime.ts";
import { resolveAbsolutePathWithVariants } from "../../runtime-paths.ts";

export type FffAdapterContext = SessionKeyContext & {
  cwd: string;
};

export function getFffRuntime(ctx: FffAdapterContext): FffRuntime {
  return ensureSessionFffRuntime(resolveSessionFffRuntimeKey(ctx), ctx.cwd);
}

export function resolveAdapterPath(cwd: string, filePath: string | undefined): string {
  return resolveAbsolutePathWithVariants(cwd, filePath ?? ".");
}

function normalizeForQuery(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

export async function buildScopedDiscoveryQuery(
  runtime: FffRuntime,
  ctx: FffAdapterContext,
  scopePath: string | undefined,
  query: string,
): Promise<string | null> {
  const trimmedQuery = query.trim();
  if (!scopePath || scopePath === ".") return trimmedQuery;

  const metadata = await runtime.getMetadata();
  const absoluteScope = resolveAdapterPath(ctx.cwd, scopePath);
  const relativeScope = path.relative(metadata.projectRoot, absoluteScope).replace(/\\/g, "/");
  if (relativeScope.startsWith("..")) return null;

  const normalizedScope = normalizeForQuery(relativeScope);
  if (!normalizedScope || normalizedScope === ".") return trimmedQuery;
  if (!trimmedQuery) return normalizedScope;
  return `${normalizedScope}/${normalizeForQuery(trimmedQuery)}`;
}

export function formatAbsolutePathList(
  paths: string[],
  options: {
    emptyMessage: string;
    singularLabel: string;
    pluralLabel: string;
    offset?: number;
    limit?: number;
    hasMore?: boolean;
  },
): string {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? (paths.length || 1));
  const visible = paths.slice(offset, offset + limit);

  if (paths.length === 0) return options.emptyMessage;

  const label = paths.length === 1 ? options.singularLabel : options.pluralLabel;
  const lines = [`${paths.length} ${label}`];
  lines.push(...visible);

  if (offset + visible.length < paths.length || options.hasMore) {
    lines.push(
      "",
      `[Showing ${offset + 1}-${offset + visible.length} of ${paths.length}${options.hasMore ? "+" : ""} matches. Use offset ${offset + visible.length} to continue.]`,
    );
  }

  return lines.join("\n");
}

export function uniqueAbsolutePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const filePath of paths) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    unique.push(filePath);
  }
  return unique;
}
