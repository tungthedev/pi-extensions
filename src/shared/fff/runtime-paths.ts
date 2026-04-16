import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getPiAgentDir } from "../runtime-paths.ts";

function stableProjectKey(projectRoot: string): string {
  return createHash("sha1").update(resolve(projectRoot)).digest("hex").slice(0, 12);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProjectRoot(cwd: string): Promise<string> {
  const start = resolve(cwd);
  let current = start;

  while (true) {
    if (await pathExists(resolve(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

export function getFffRootDir(): string {
  return resolve(getPiAgentDir(), "pi-fff");
}

export function getProjectDatabasePaths(root: string, projectRoot: string) {
  const dbDir = resolve(root, stableProjectKey(projectRoot));
  return {
    dbDir,
    frecencyDbPath: resolve(dbDir, "frecency.db"),
    historyDbPath: resolve(dbDir, "history.db"),
  };
}
