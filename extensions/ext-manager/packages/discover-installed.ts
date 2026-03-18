import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { InstalledPackage, Scope } from "../types.ts";

export function normalizeSource(source: string): string {
  return source.trim().replace(/\s+\((filtered|pinned)\)$/i, "").trim();
}

function displayNameFromSource(source: string): string {
  const trimmed = source.replace(/[@#].*$/, "").replace(/\/+$/g, "").replace(/\\+$/g, "");
  const parts = trimmed.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] ?? source;
}

export type ParsedInstalledPackageEntry = {
  scope: Scope;
  source: string;
  resolvedPath: string;
};

export function parseInstalledPackagesFromListOutput(text: string): ParsedInstalledPackageEntry[] {
  const normalizedText = text.trim();
  if (!normalizedText) return [];

  const packages: ParsedInstalledPackageEntry[] = [];
  let currentScope: Scope = "global";
  let pendingSource: string | null = null;

  for (const rawLine of normalizedText.split("\n")) {
    const line = rawLine.replace(/\r/g, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (lower.startsWith("user packages") || lower.startsWith("global packages")) {
      currentScope = "global";
      pendingSource = null;
      continue;
    }

    if (lower.startsWith("project packages") || lower.startsWith("local packages")) {
      currentScope = "project";
      pendingSource = null;
      continue;
    }

    if (/^\s{2}\S/.test(line) && !/^\s{4}\S/.test(line)) {
      pendingSource = trimmed;
      continue;
    }

    if (/^\s{4}\S/.test(line) && pendingSource) {
      packages.push({
        scope: currentScope,
        source: normalizeSource(pendingSource),
        resolvedPath: trimmed,
      });
      pendingSource = null;
    }
  }

  return packages;
}

export async function discoverInstalledPackages(
  pi: ExtensionAPI,
  cwd: string,
): Promise<InstalledPackage[]> {
  const result = await pi.exec("pi", ["list"], { cwd, timeout: 5_000 });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (!text) return [];

  const parsedPackages = parseInstalledPackagesFromListOutput(text);
  const packages: InstalledPackage[] = [];

  for (const parsed of parsedPackages) {
    const packageJsonPath = join(parsed.resolvedPath, "package.json");
    let name = displayNameFromSource(parsed.source);
    try {
      const pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as { name?: string };
      if (pkg?.name) name = pkg.name;
    } catch {
      // ignore
    }

    packages.push({
      id: `${parsed.scope}:${parsed.source}`,
      scope: parsed.scope,
      source: parsed.source,
      name,
      resolvedPath: parsed.resolvedPath,
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}
