import fs from "node:fs";
import path from "node:path";

const SYSTEM_MD_FILE = "SYSTEM.md";
const GIT_DIR = ".git";

function resolveExistingGitRoot(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    try {
      if (fs.existsSync(path.join(currentDir, GIT_DIR))) {
        return currentDir;
      }
    } catch {
      return undefined;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function resolveSystemMdPath(cwd: string): string {
  const projectRoot = resolveExistingGitRoot(cwd) ?? path.resolve(cwd);
  return path.join(projectRoot, SYSTEM_MD_FILE);
}

export function readSystemMdPrompt(cwd: string): string | undefined {
  const systemMdPath = resolveSystemMdPath(cwd);

  try {
    const stats = fs.statSync(systemMdPath);
    if (!stats.isFile()) return undefined;
  } catch {
    return undefined;
  }

  try {
    const content = fs.readFileSync(systemMdPath, "utf8").trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

export function buildSystemMdPrompt(cwd: string): string | undefined {
  return readSystemMdPrompt(cwd);
}

export function resolveSystemMdPrompt(cwd: string | undefined, enabled: boolean): string | undefined {
  if (!enabled || !cwd) return undefined;
  return buildSystemMdPrompt(cwd);
}
