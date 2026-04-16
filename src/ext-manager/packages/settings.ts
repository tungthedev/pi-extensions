import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";

import type { Scope, State } from "../types.ts";

import { mutateJsonObjectFile, readJsonObjectFile } from "../../shared/json-settings.ts";
import { normalizeSource } from "./discover-installed.ts";
import { getPackageFilterState, normalizeRelativePath, updateExtensionMarkers } from "./filters.ts";

interface PackageSettingsObject {
  source: string;
  extensions?: string[];
}

interface SettingsFile {
  packages?: (string | PackageSettingsObject)[];
}

function getSettingsPath(scope: Scope, cwd: string): string {
  return scope === "project"
    ? join(cwd, ".pi", "settings.json")
    : join(getAgentDir(), "settings.json");
}

export async function getPackageExtensionState(
  packageSource: string,
  extensionPath: string,
  scope: Scope,
  cwd: string,
): Promise<State> {
  const settings = (await readJsonObjectFile(getSettingsPath(scope, cwd))) as SettingsFile;
  const normalizedSource = normalizeSource(packageSource);
  const entry = (settings.packages ?? []).find((value) => {
    if (typeof value === "string") return normalizeSource(value) === normalizedSource;
    return normalizeSource(value.source) === normalizedSource;
  });

  if (!entry || typeof entry === "string") {
    return "enabled";
  }

  return getPackageFilterState(entry.extensions, extensionPath);
}

function findPackageSettingsIndex(
  packages: NonNullable<SettingsFile["packages"]>,
  normalizedSource: string,
): number {
  return packages.findIndex((value) => {
    if (typeof value === "string") return normalizeSource(value) === normalizedSource;
    return normalizeSource(value.source) === normalizedSource;
  });
}

function toPackageSettingsObject(
  existing: string | PackageSettingsObject | undefined,
  packageSource: string,
): PackageSettingsObject {
  if (typeof existing === "string") {
    return { source: existing, extensions: [] };
  }

  if (existing?.source) {
    return {
      source: existing.source,
      extensions: Array.isArray(existing.extensions) ? [...existing.extensions] : [],
    };
  }

  return { source: packageSource, extensions: [] };
}

export async function applyPackageExtensionStateChanges(
  packageSource: string,
  scope: Scope,
  changes: readonly { extensionPath: string; target: State }[],
  cwd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const settingsPath = getSettingsPath(scope, cwd);
    await mutateJsonObjectFile(
      settingsPath,
      (currentRoot) => {
        const settings = currentRoot as SettingsFile;
        const normalizedSource = normalizeSource(packageSource);
        const packages = [...(settings.packages ?? [])];
        const index = findPackageSettingsIndex(packages, normalizedSource);
        const packageEntry = toPackageSettingsObject(packages[index], packageSource);

        const normalizedChanges = new Map<string, State>();
        for (const change of changes) {
          normalizedChanges.set(normalizeRelativePath(change.extensionPath), change.target);
        }

        packageEntry.extensions = updateExtensionMarkers(packageEntry.extensions, normalizedChanges);

        if (index === -1) {
          packages.push(packageEntry);
        } else {
          packages[index] = packageEntry;
        }

        settings.packages = packages;
        return settings as Record<string, unknown>;
      },
      { strict: true },
    );

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
