import { matchesGlob } from "node:path";

import type { State } from "../types.ts";

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function isExtensionEntrypointPath(path: string): boolean {
  return /\.(ts|js)$/i.test(path);
}

export function hasGlobMagic(path: string): boolean {
  return /[*?{}[\]]/.test(path);
}

export function isSafeRelativePath(path: string): boolean {
  return path !== "" && path !== ".." && !path.startsWith("../") && !path.includes("/../");
}

export function matchesFilterPattern(targetPath: string, pattern: string): boolean {
  const normalizedPattern = normalizeRelativePath(pattern.trim());
  if (!normalizedPattern) return false;
  if (targetPath === normalizedPattern) return true;
  try {
    return matchesGlob(targetPath, normalizedPattern);
  } catch {
    return false;
  }
}

export function getPackageFilterState(filters: string[] | undefined, extensionPath: string): State {
  if (filters === undefined) return "enabled";
  if (filters.length === 0) return "disabled";

  const normalizedTarget = normalizeRelativePath(extensionPath);
  const includePatterns: string[] = [];
  const excludePatterns: string[] = [];
  let markerOverride: State | undefined;

  for (const rawToken of filters) {
    const token = rawToken.trim();
    if (!token) continue;

    const prefix = token[0];
    if (prefix === "+" || prefix === "-") {
      const markerPath = normalizeRelativePath(token.slice(1));
      if (markerPath === normalizedTarget) {
        markerOverride = prefix === "+" ? "enabled" : "disabled";
      }
      continue;
    }

    if (prefix === "!") {
      const pattern = normalizeRelativePath(token.slice(1));
      if (pattern) excludePatterns.push(pattern);
      continue;
    }

    const include = normalizeRelativePath(token);
    if (include) includePatterns.push(include);
  }

  let enabled =
    includePatterns.length === 0 ||
    includePatterns.some((pattern) => matchesFilterPattern(normalizedTarget, pattern));

  if (
    enabled &&
    excludePatterns.some((pattern) => matchesFilterPattern(normalizedTarget, pattern))
  ) {
    enabled = false;
  }

  if (markerOverride !== undefined) {
    enabled = markerOverride === "enabled";
  }

  return enabled ? "enabled" : "disabled";
}

export function updateExtensionMarkers(
  existingTokens: string[] | undefined,
  changes: ReadonlyMap<string, State>,
): string[] {
  const nextTokens: string[] = [];

  for (const token of existingTokens ?? []) {
    if (typeof token !== "string") continue;

    if (token[0] !== "+" && token[0] !== "-") {
      nextTokens.push(token);
      continue;
    }

    const tokenPath = normalizeRelativePath(token.slice(1));
    if (!changes.has(tokenPath)) {
      nextTokens.push(token);
    }
  }

  for (const [extensionPath, target] of Array.from(changes.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    nextTokens.push(`${target === "enabled" ? "+" : "-"}${extensionPath}`);
  }

  return nextTokens;
}
