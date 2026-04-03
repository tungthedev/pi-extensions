import { accessSync, constants as fsConstants } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { findExecutableOnPath, getPiBinDir } from "../codex-content/tools/runtime.ts";
import { getGlobalPiSettingsPath } from "../settings/config.ts";

type GlobalPiSettings = {
  shellPath?: unknown;
};

type ShellFlavor = "posix" | "fish" | "unknown";

export type ShellInvocation = {
  shell: string;
  shellArgs: string[];
};

export type ShellInvocationOptions = {
  login?: boolean;
  userShell?: string;
  configuredShellPath?: string;
  shellExists?: (shellPath: string) => boolean;
};

export async function readConfiguredShellPath(
  filePath = getGlobalPiSettingsPath(),
): Promise<string | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) return undefined;

    const parsed = JSON.parse(raw) as GlobalPiSettings;
    return typeof parsed.shellPath === "string" && parsed.shellPath.trim()
      ? parsed.shellPath.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function getShellEnv(): NodeJS.ProcessEnv {
  const binDir = getPiBinDir();
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = process.env[pathKey] ?? "";
  const delimiter = path.delimiter;
  const pathEntries = currentPath.split(delimiter).filter(Boolean);
  const normalizedBinDir = path.normalize(binDir);
  const hasBinDir = pathEntries.some((entry) => {
    const normalizedEntry = path.normalize(entry);
    if (process.platform === "win32") {
      return normalizedEntry.toLowerCase() === normalizedBinDir.toLowerCase();
    }

    return normalizedEntry === normalizedBinDir;
  });
  const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

  return {
    ...process.env,
    [pathKey]: updatedPath,
  };
}

export function splitLeadingCdCommand(
  command: string,
): { workdir: string; command: string } | null {
  const match = command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)\s*(.+)$/s);
  if (!match) return null;

  const workdir = match[1] ?? match[2] ?? match[3];
  const nextCommand = match[4]?.trim();
  if (!workdir || !nextCommand) return null;

  return { workdir, command: nextCommand };
}

export function stripTrailingBackgroundOperator(command: string): {
  command: string;
  stripped: boolean;
} {
  const strippedCommand = command.replace(/\s*&\s*$/, "").trimEnd();
  return {
    command: strippedCommand,
    stripped: strippedCommand !== command,
  };
}

function shellPathExists(shellPath: string): boolean {
  try {
    accessSync(shellPath, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findWindowsBash(shellExists = shellPathExists): string | undefined {
  const candidates: string[] = [];
  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    candidates.push(path.join(programFiles, "Git", "bin", "bash.exe"));
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, "Git", "bin", "bash.exe"));
  }

  const bundledBash = candidates.find((candidate) => shellExists(candidate));
  if (bundledBash) {
    return bundledBash;
  }

  const bashOnPath = findExecutableOnPath("bash");
  if (bashOnPath && shellExists(bashOnPath)) {
    return bashOnPath;
  }

  return undefined;
}

function detectShellFlavor(
  shellPath: string | undefined,
  shellExists = shellPathExists,
): ShellFlavor {
  if (!shellPath || !shellExists(shellPath)) {
    return "unknown";
  }

  const shellName = (shellPath.split(/[\\/]/).at(-1) ?? shellPath)
    .replace(/\.(?:exe|cmd|bat)$/i, "")
    .toLowerCase();
  if (["sh", "bash", "zsh", "dash", "ksh", "ash"].includes(shellName)) {
    return "posix";
  }
  if (shellName === "fish") {
    return "fish";
  }

  return "unknown";
}

function pickFirstExistingShell(
  candidates: Array<string | undefined>,
  shellExists = shellPathExists,
): string | undefined {
  return candidates.find((candidate) => candidate && shellExists(candidate));
}

function fallbackShellCandidates(login: boolean): string[] {
  if (login) {
    return ["/bin/bash", "/bin/zsh", "/bin/sh"];
  }

  return ["/bin/sh", "/bin/bash", "/bin/zsh"];
}

function fallbackShellArgs(shell: string, command: string, login: boolean): string[] {
  if (login && shell !== "/bin/sh") {
    return ["-lc", command];
  }

  return ["-c", command];
}

export function resolveShellInvocation(
  command: string,
  options: ShellInvocationOptions = {},
): ShellInvocation {
  const login = options.login === true;
  const configuredShellPath = options.configuredShellPath?.trim();
  const userShell = options.userShell ?? process.env.SHELL;
  const shellExists = options.shellExists ?? shellPathExists;

  if (configuredShellPath && shellExists(configuredShellPath)) {
    const configuredFlavor = detectShellFlavor(configuredShellPath, shellExists);
    if (configuredFlavor === "fish") {
      return {
        shell: configuredShellPath,
        shellArgs: login ? ["-l", "-c", command] : ["-c", command],
      };
    }

    return {
      shell: configuredShellPath,
      shellArgs: [login ? "-lc" : "-c", command],
    };
  }

  const flavor = detectShellFlavor(userShell, shellExists);

  if (userShell && flavor === "posix") {
    return {
      shell: userShell,
      shellArgs: [login ? "-lc" : "-c", command],
    };
  }

  if (userShell && flavor === "fish") {
    return {
      shell: userShell,
      shellArgs: login ? ["-l", "-c", command] : ["-c", command],
    };
  }

  if (process.platform === "win32") {
    const windowsBash = findWindowsBash(shellExists);
    if (!windowsBash) {
      throw new Error(
        "No bash shell found. Install Git Bash or add bash.exe to PATH, or configure a supported shell path.",
      );
    }

    return {
      shell: windowsBash,
      shellArgs: [login ? "-lc" : "-c", command],
    };
  }

  const fallbackShell =
    pickFirstExistingShell(
      [...fallbackShellCandidates(login), findExecutableOnPath("bash")],
      shellExists,
    ) ?? "/bin/sh";
  return {
    shell: fallbackShell,
    shellArgs: fallbackShellArgs(fallbackShell, command, login),
  };
}
