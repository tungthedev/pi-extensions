import type { Dirent } from "node:fs";

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { LocalExtensionEntry, Scope } from "../types.ts";

import {
  probeExtensionDirectory,
  probeExtensionFile,
  shortenHomePath,
} from "./probe.ts";

interface RootConfig {
  root: string;
  label: string;
  scope: Scope;
}

interface SettingsFile {
  extensions?: string[];
}

function resolveSettingsPath(rawPath: string, settingsFilePath: string): string | undefined {
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;
  if (
    /[*?{}[\]]/.test(trimmed) ||
    trimmed.startsWith("!") ||
    trimmed.startsWith("+") ||
    trimmed.startsWith("-")
  ) {
    return undefined;
  }
  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) {
    return trimmed;
  }
  return resolve(dirname(settingsFilePath), trimmed);
}

async function discoverConfiguredExtensions(
  settingsFilePath: string,
  scope: Scope,
): Promise<LocalExtensionEntry[]> {
  let settings: SettingsFile;
  try {
    settings = JSON.parse(await readFile(settingsFilePath, "utf8")) as SettingsFile;
  } catch {
    return [];
  }

  const configured = Array.isArray(settings.extensions) ? settings.extensions : [];
  const entries: LocalExtensionEntry[] = [];

  for (const value of configured) {
    if (typeof value !== "string") continue;
    const resolvedPath = resolveSettingsPath(value, settingsFilePath);
    if (!resolvedPath) continue;

    try {
      const pathStat = await stat(resolvedPath);
      const entry = pathStat.isDirectory()
        ? await probeExtensionDirectory(resolvedPath, scope, (activePath) => shortenHomePath(activePath))
        : await probeExtensionFile(resolvedPath, scope, shortenHomePath(resolvedPath), {
            allowAlternateState: true,
          });
      if (entry) entries.push(entry);
    } catch {
      const entry = await probeExtensionFile(resolvedPath, scope, shortenHomePath(resolvedPath), {
        allowAlternateState: true,
      });
      if (entry) entries.push(entry);
    }
  }

  return entries;
}

async function discoverInRoot(config: RootConfig): Promise<LocalExtensionEntry[]> {
  let dirEntries: Dirent[];
  try {
    dirEntries = await readdir(config.root, { withFileTypes: true });
  } catch {
    return [];
  }

  const entries: LocalExtensionEntry[] = [];

  for (const item of dirEntries) {
    if (item.name.startsWith(".")) continue;

    if (item.isFile()) {
      const currentPath = join(config.root, item.name);
      const entry = await probeExtensionFile(
        currentPath,
        config.scope,
        `${config.label}/${relative(config.root, currentPath).replace(/\.disabled$/i, "")}`,
      );
      if (entry) entries.push(entry);
      continue;
    }

    if (item.isDirectory()) {
      const directoryPath = join(config.root, item.name);
      const entry = await probeExtensionDirectory(
        directoryPath,
        config.scope,
        (activePath) => `${config.label}/${relative(config.root, activePath)}`,
      );
      if (entry) entries.push(entry);
    }
  }

  return entries;
}

export async function discoverLocalExtensions(cwd: string): Promise<LocalExtensionEntry[]> {
  const agentDir = join(homedir(), ".pi", "agent");
  const roots: RootConfig[] = [
    {
      root: join(agentDir, "extensions"),
      label: "~/.pi/agent/extensions",
      scope: "global",
    },
    {
      root: join(cwd, ".pi", "extensions"),
      label: ".pi/extensions",
      scope: "project",
    },
  ];

  const discoveredRoots = await Promise.all(roots.map((root) => discoverInRoot(root)));
  const configuredGlobal = await discoverConfiguredExtensions(
    join(agentDir, "settings.json"),
    "global",
  );
  const configuredProject = await discoverConfiguredExtensions(
    join(cwd, ".pi", "settings.json"),
    "project",
  );

  const deduped = new Map<string, LocalExtensionEntry>();
  for (const entry of [...discoveredRoots.flat(), ...configuredGlobal, ...configuredProject]) {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
    }
  }

  const entries = [...deduped.values()];
  entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return entries;
}
