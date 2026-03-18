import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

import type { LocalExtensionEntry, Scope, State } from "../types.ts";
import { fileExists } from "../shared/fs.ts";
import { readSummary } from "../shared/summary.ts";

const DISABLED_SUFFIX = ".disabled";

interface RootConfig {
  root: string;
  label: string;
  scope: Scope;
}

interface SettingsFile {
  extensions?: string[];
}

async function parseTopLevelFile(
  root: string,
  label: string,
  scope: Scope,
  fileName: string,
): Promise<LocalExtensionEntry | undefined> {
  const isEnabledTsJs = /\.(ts|js)$/i.test(fileName) && !fileName.endsWith(DISABLED_SUFFIX);
  const isDisabledTsJs = /\.(ts|js)\.disabled$/i.test(fileName);
  if (!isEnabledTsJs && !isDisabledTsJs) return undefined;

  const currentPath = join(root, fileName);
  const activePath = isDisabledTsJs
    ? currentPath.slice(0, -DISABLED_SUFFIX.length)
    : currentPath;
  const disabledPath = `${activePath}${DISABLED_SUFFIX}`;
  const state: State = isDisabledTsJs ? "disabled" : "enabled";
  const summary = await readSummary(state === "enabled" ? activePath : disabledPath);
  const relativePath = relative(root, activePath).replace(/\.disabled$/i, "");

  return {
    id: `${scope}:${activePath}`,
    scope,
    state,
    activePath,
    disabledPath,
    displayName: `${label}/${relativePath}`,
    summary,
  };
}

async function parseDirectoryIndex(
  root: string,
  label: string,
  scope: Scope,
  dirName: string,
): Promise<LocalExtensionEntry | undefined> {
  const dir = join(root, dirName);

  for (const ext of [".ts", ".js"]) {
    const activePath = join(dir, `index${ext}`);
    const disabledPath = `${activePath}${DISABLED_SUFFIX}`;

    if (await fileExists(activePath)) {
      return {
        id: `${scope}:${activePath}`,
        scope,
        state: "enabled",
        activePath,
        disabledPath,
        displayName: `${label}/${dirName}/index${ext}`,
        summary: await readSummary(activePath),
      };
    }

    if (await fileExists(disabledPath)) {
      return {
        id: `${scope}:${activePath}`,
        scope,
        state: "disabled",
        activePath,
        disabledPath,
        displayName: `${label}/${dirName}/index${ext}`,
        summary: await readSummary(disabledPath),
      };
    }
  }

  return undefined;
}

function shortenHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

async function parseConfiguredFile(
  configuredPath: string,
  scope: Scope,
): Promise<LocalExtensionEntry | undefined> {
  const fileName = configuredPath.split("/").pop() ?? configuredPath;
  const isEnabledTsJs = /\.(ts|js)$/i.test(fileName) && !fileName.endsWith(DISABLED_SUFFIX);
  const isDisabledTsJs = /\.(ts|js)\.disabled$/i.test(fileName);
  if (!isEnabledTsJs && !isDisabledTsJs) return undefined;

  const activePath = isDisabledTsJs
    ? configuredPath.slice(0, -DISABLED_SUFFIX.length)
    : configuredPath;
  const disabledPath = `${activePath}${DISABLED_SUFFIX}`;
  const enabledExists = await fileExists(activePath);
  const disabledExists = await fileExists(disabledPath);

  if (!enabledExists && !disabledExists) {
    return undefined;
  }

  const state: State = isDisabledTsJs
    ? disabledExists
      ? "disabled"
      : "enabled"
    : enabledExists
      ? "enabled"
      : "disabled";
  const summary = await readSummary(state === "enabled" ? activePath : disabledPath);

  return {
    id: `${scope}:${activePath}`,
    scope,
    state,
    activePath,
    disabledPath,
    displayName: shortenHome(activePath),
    summary,
  };
}

async function parseConfiguredDirectory(
  configuredPath: string,
  scope: Scope,
): Promise<LocalExtensionEntry | undefined> {
  for (const ext of [".ts", ".js"]) {
    const activePath = join(configuredPath, `index${ext}`);
    const disabledPath = `${activePath}${DISABLED_SUFFIX}`;

    if (await fileExists(activePath)) {
      return {
        id: `${scope}:${activePath}`,
        scope,
        state: "enabled",
        activePath,
        disabledPath,
        displayName: shortenHome(activePath),
        summary: await readSummary(activePath),
      };
    }

    if (await fileExists(disabledPath)) {
      return {
        id: `${scope}:${activePath}`,
        scope,
        state: "disabled",
        activePath,
        disabledPath,
        displayName: shortenHome(activePath),
        summary: await readSummary(disabledPath),
      };
    }
  }

  return undefined;
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
        ? await parseConfiguredDirectory(resolvedPath, scope)
        : await parseConfiguredFile(resolvedPath, scope);
      if (entry) entries.push(entry);
    } catch {
      const entry = await parseConfiguredFile(resolvedPath, scope);
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
      const entry = await parseTopLevelFile(config.root, config.label, config.scope, item.name);
      if (entry) entries.push(entry);
      continue;
    }

    if (item.isDirectory()) {
      const entry = await parseDirectoryIndex(config.root, config.label, config.scope, item.name);
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
  const configuredGlobal = await discoverConfiguredExtensions(join(agentDir, "settings.json"), "global");
  const configuredProject = await discoverConfiguredExtensions(join(cwd, ".pi", "settings.json"), "project");

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
