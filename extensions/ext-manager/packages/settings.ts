import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getAgentDir } from "@mariozechner/pi-coding-agent";

import type { Scope, State } from "../types.ts";
import { getPackageFilterState, normalizeRelativePath, updateExtensionMarkers } from "./filters.ts";
import { normalizeSource } from "./discover-installed.ts";

interface PackageSettingsObject {
  source: string;
  extensions?: string[];
}

interface SettingsFile {
  packages?: (string | PackageSettingsObject)[];
}

function getSettingsPath(scope: Scope, cwd: string): string {
  return scope === "project" ? join(cwd, ".pi", "settings.json") : join(getAgentDir(), "settings.json");
}

async function readSettingsFile(path: string, strict = false): Promise<SettingsFile> {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (strict) throw new Error(`Invalid settings format in ${path}: expected object`);
      return {};
    }
    return parsed as SettingsFile;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    if (strict) throw error;
    return {};
  }
}

async function writeSettingsFile(path: string, settings: SettingsFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(settings, null, 2)}\n`;

  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, path);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

export async function getPackageExtensionState(
  packageSource: string,
  extensionPath: string,
  scope: Scope,
  cwd: string,
): Promise<State> {
  const settings = await readSettingsFile(getSettingsPath(scope, cwd));
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
    const settings = await readSettingsFile(settingsPath, true);
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
    await writeSettingsFile(settingsPath, settings);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
