import { homedir } from "node:os";
import { join } from "node:path";

import type { LocalExtensionEntry, Scope, State } from "../types.ts";

import { fileExists } from "../shared/fs.ts";
import { readSummary } from "../shared/summary.ts";

export const DISABLED_SUFFIX = ".disabled";

function resolveFileProbeState(candidatePath: string):
  | { activePath: string; disabledPath: string; state: State }
  | undefined {
  const fileName = candidatePath.split("/").pop() ?? candidatePath;
  const isEnabledTsJs = /\.(ts|js)$/i.test(fileName) && !fileName.endsWith(DISABLED_SUFFIX);
  const isDisabledTsJs = /\.(ts|js)\.disabled$/i.test(fileName);
  if (!isEnabledTsJs && !isDisabledTsJs) return undefined;

  const activePath = isDisabledTsJs
    ? candidatePath.slice(0, -DISABLED_SUFFIX.length)
    : candidatePath;
  return {
    activePath,
    disabledPath: `${activePath}${DISABLED_SUFFIX}`,
    state: isDisabledTsJs ? "disabled" : "enabled",
  };
}

export async function buildLocalExtensionEntry(options: {
  scope: Scope;
  state: State;
  activePath: string;
  disabledPath: string;
  displayName: string;
}): Promise<LocalExtensionEntry> {
  return {
    id: `${options.scope}:${options.activePath}`,
    scope: options.scope,
    state: options.state,
    activePath: options.activePath,
    disabledPath: options.disabledPath,
    displayName: options.displayName,
    summary: await readSummary(options.state === "enabled" ? options.activePath : options.disabledPath),
  };
}

export async function probeExtensionFile(
  candidatePath: string,
  scope: Scope,
  displayName: string,
  options: { allowAlternateState?: boolean } = {},
): Promise<LocalExtensionEntry | undefined> {
  const resolved = resolveFileProbeState(candidatePath);
  if (!resolved) return undefined;

  let state = resolved.state;
  if (options.allowAlternateState) {
    const enabledExists = await fileExists(resolved.activePath);
    const disabledExists = await fileExists(resolved.disabledPath);
    if (!enabledExists && !disabledExists) {
      return undefined;
    }

    state = resolved.state === "disabled"
      ? disabledExists
        ? "disabled"
        : "enabled"
      : enabledExists
        ? "enabled"
        : "disabled";
  }

  return buildLocalExtensionEntry({
    scope,
    state,
    activePath: resolved.activePath,
    disabledPath: resolved.disabledPath,
    displayName,
  });
}

export async function probeExtensionDirectory(
  directoryPath: string,
  scope: Scope,
  displayName: (entryPath: string) => string,
): Promise<LocalExtensionEntry | undefined> {
  for (const ext of [".ts", ".js"]) {
    const activePath = join(directoryPath, `index${ext}`);
    const disabledPath = `${activePath}${DISABLED_SUFFIX}`;

    if (await fileExists(activePath)) {
      return buildLocalExtensionEntry({
        scope,
        state: "enabled",
        activePath,
        disabledPath,
        displayName: displayName(activePath),
      });
    }

    if (await fileExists(disabledPath)) {
      return buildLocalExtensionEntry({
        scope,
        state: "disabled",
        activePath,
        disabledPath,
        displayName: displayName(activePath),
      });
    }
  }

  return undefined;
}

export function shortenHomePath(filePath: string): string {
  const home = homedir();
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}
