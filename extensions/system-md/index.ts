import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import fs from "node:fs";
import path from "node:path";

import { readTungthedevSettings, type TungthedevSettings } from "../settings/config.ts";
import { enableSystemMdPrompt } from "./state.ts";

const SYSTEM_MD_FILE = "SYSTEM.md";
const GIT_DIR = ".git";

export type SystemMdPromptDeps = {
  readSettings: () => Promise<TungthedevSettings>;
};

function createDefaultDeps(): SystemMdPromptDeps {
  return {
    readSettings: () => readTungthedevSettings(),
  };
}

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

export async function handleSystemMdBeforeAgentStart(
  _event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  deps: SystemMdPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  const settings = await deps.readSettings();
  if (!settings.systemMdPrompt) return undefined;

  const systemPrompt = buildSystemMdPrompt(ctx.cwd);
  if (!systemPrompt) return undefined;

  return { systemPrompt };
}

export function registerSystemMdPrompt(
  pi: ExtensionAPI,
  deps: SystemMdPromptDeps = createDefaultDeps(),
): void {
  enableSystemMdPrompt();
  pi.on("before_agent_start", async (event, ctx) =>
    handleSystemMdBeforeAgentStart(event, ctx, deps),
  );
}

export default function registerSystemMdExtension(pi: ExtensionAPI): void {
  registerSystemMdPrompt(pi);
}
