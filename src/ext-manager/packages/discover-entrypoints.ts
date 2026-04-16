import type { Dirent } from "node:fs";

import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { InstalledPackage, PackageExtensionEntry } from "../types.ts";

import { fileExists } from "../shared/fs.ts";
import { readSummary } from "../shared/summary.ts";
import {
  hasGlobMagic,
  isExtensionEntrypointPath,
  isSafeRelativePath,
  matchesFilterPattern,
  normalizeRelativePath,
} from "./filters.ts";
import { getPackageExtensionState } from "./settings.ts";

interface PackageManifest {
  name?: string;
  pi?: {
    extensions?: unknown;
  };
}

async function readPackageManifest(packageRoot: string): Promise<PackageManifest | undefined> {
  try {
    const path = join(packageRoot, "package.json");
    return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

async function collectExtensionFilesFromDir(
  packageRoot: string,
  startDir: string,
): Promise<string[]> {
  const collected: string[] = [];

  let entries: Dirent[];
  try {
    entries = await readdir(startDir, { withFileTypes: true });
  } catch {
    return collected;
  }

  for (const entry of entries) {
    const absolutePath = join(startDir, entry.name);

    if (entry.isDirectory()) {
      collected.push(...(await collectExtensionFilesFromDir(packageRoot, absolutePath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const relativePath = normalizeRelativePath(relative(packageRoot, absolutePath));
    if (isExtensionEntrypointPath(relativePath)) {
      collected.push(relativePath);
    }
  }

  return collected;
}

function applySelection(selected: Set<string>, files: Iterable<string>, exclude: boolean): void {
  for (const file of files) {
    if (exclude) selected.delete(file);
    else selected.add(file);
  }
}

function selectDirectoryFiles(allFiles: string[], directoryPath: string): string[] {
  const prefix = `${directoryPath}/`;
  return allFiles.filter((file) => file.startsWith(prefix));
}

async function resolveManifestExtensionEntries(
  packageRoot: string,
  entries: string[],
): Promise<string[]> {
  const selected = new Set<string>();
  const allFiles = await collectExtensionFilesFromDir(packageRoot, packageRoot);

  for (const rawToken of entries) {
    const token = rawToken.trim();
    if (!token) continue;

    const exclude = token.startsWith("!");
    const normalizedToken = normalizeRelativePath(exclude ? token.slice(1) : token);
    const pattern = normalizedToken.replace(/[\\/]+$/g, "");
    if (!isSafeRelativePath(pattern)) continue;

    if (hasGlobMagic(pattern)) {
      const matchedFiles = allFiles.filter((file) => matchesFilterPattern(file, pattern));
      applySelection(selected, matchedFiles, exclude);
      continue;
    }

    const directoryFiles = selectDirectoryFiles(allFiles, pattern);
    if (directoryFiles.length > 0) {
      applySelection(selected, directoryFiles, exclude);
      continue;
    }

    if (isExtensionEntrypointPath(pattern)) {
      applySelection(selected, [pattern], exclude);
    }
  }

  return Array.from(selected).sort((a, b) => a.localeCompare(b));
}

export async function discoverPackageExtensionEntrypoints(packageRoot: string): Promise<string[]> {
  const manifest = await readPackageManifest(packageRoot);
  const manifestExtensions = manifest?.pi?.extensions;

  if (Array.isArray(manifestExtensions)) {
    const entries = manifestExtensions.filter(
      (value): value is string => typeof value === "string",
    );
    return resolveManifestExtensionEntries(packageRoot, entries);
  }

  const conventionDir = join(packageRoot, "extensions");
  const conventionEntries = await collectExtensionFilesFromDir(packageRoot, conventionDir);
  if (conventionEntries.length > 0) {
    return conventionEntries.sort((a, b) => a.localeCompare(b));
  }

  for (const fallback of ["index.ts", "index.js"]) {
    const absolute = join(packageRoot, fallback);
    if (await fileExists(absolute)) {
      return [fallback];
    }
  }

  return [];
}

export async function discoverPackageExtensions(
  pkg: InstalledPackage,
  cwd: string,
): Promise<PackageExtensionEntry[]> {
  const extensionPaths = await discoverPackageExtensionEntrypoints(pkg.resolvedPath);
  const entries: PackageExtensionEntry[] = [];

  for (const extensionPath of extensionPaths) {
    const normalizedPath = normalizeRelativePath(extensionPath);
    const absolutePath = resolve(pkg.resolvedPath, extensionPath);
    const available = await fileExists(absolutePath);
    const summary = available ? await readSummary(absolutePath) : "package extension";
    const originalState = await getPackageExtensionState(
      pkg.source,
      normalizedPath,
      pkg.scope,
      cwd,
    );

    entries.push({
      id: `${pkg.id}:${normalizedPath}`,
      packageId: pkg.id,
      packageSource: pkg.source,
      scope: pkg.scope,
      extensionPath: normalizedPath,
      absolutePath,
      displayName: `${pkg.name}/${normalizedPath}`,
      summary,
      available,
      originalState,
    });
  }

  entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return entries;
}
