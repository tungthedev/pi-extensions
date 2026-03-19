import { Text } from "@mariozechner/pi-tui";
import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINES = 2000;
export const MAX_LINE_LENGTH = 500;
export const MAX_CAPTURE_BYTES = 256 * 1024;
export const MAX_SLICE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_INDENTATION_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_LIST_DIR_SCAN_ENTRIES = 5_000;
export const TAB_WIDTH = 4;
export const COMMENT_PREFIXES = ["#", "//", "--"];

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type ShellFlavor = "posix" | "fish" | "unknown";

export type ShellInvocation = {
  shell: string;
  shellArgs: string[];
};

export type ShellInvocationOptions = {
  login?: boolean;
  userShell?: string;
  shellExists?: (shellPath: string) => boolean;
};

type WindowedCapture = {
  head: string;
  tail: string;
  truncated: boolean;
};

const CAPTURE_SEGMENT_BYTES = Math.floor(MAX_CAPTURE_BYTES / 2);

function normalizePath(input: string): string {
  const stripped = input.startsWith("@") ? input.slice(1) : input;
  if (stripped === "~") return os.homedir();
  if (stripped.startsWith("~/")) return path.join(os.homedir(), stripped.slice(2));
  return stripped;
}

export function truncateLine(text: string): string {
  return text.length > MAX_LINE_LENGTH ? `${text.slice(0, MAX_LINE_LENGTH)}...` : text;
}

export function trimToBudget(text: string): { text: string; truncated: boolean } {
  const lines = text.replace(/\r/g, "").split("\n");
  const visibleLines: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (const line of lines) {
    if (visibleLines.length >= DEFAULT_MAX_LINES) {
      truncated = true;
      break;
    }

    const candidate = truncateLine(line);
    const lineBytes = Buffer.byteLength(candidate + "\n", "utf-8");
    if (bytes + lineBytes > DEFAULT_MAX_BYTES) {
      truncated = true;
      break;
    }

    visibleLines.push(candidate);
    bytes += lineBytes;
  }

  let output = visibleLines.join("\n");
  if (truncated) {
    output += "\n\n[Output truncated]";
  }

  return { text: output, truncated };
}

export function resolveAbsolutePath(cwd: string, input: string): string {
  const normalized = normalizePath(input);
  return path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
}

function pathExists(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveAbsolutePathWithVariants(cwd: string, input: string): string {
  const resolved = resolveAbsolutePath(cwd, input);
  if (pathExists(resolved)) return resolved;

  const withNarrowNoBreakSpace = resolved.replace(/ (AM|PM)\./g, "\u202F$1.");
  if (withNarrowNoBreakSpace !== resolved && pathExists(withNarrowNoBreakSpace)) {
    return withNarrowNoBreakSpace;
  }

  const normalizedNfd = resolved.normalize("NFD");
  if (normalizedNfd !== resolved && pathExists(normalizedNfd)) {
    return normalizedNfd;
  }

  return resolved;
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
    accessSync(shellPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function detectShellFlavor(
  shellPath: string | undefined,
  shellExists = shellPathExists,
): ShellFlavor {
  if (!shellPath || !shellExists(shellPath)) {
    return "unknown";
  }

  const shellName = path.basename(shellPath).toLowerCase();
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

export function resolveShellInvocation(
  command: string,
  options: ShellInvocationOptions = {},
): ShellInvocation {
  const login = options.login === true;
  const userShell = options.userShell ?? process.env.SHELL;
  const shellExists = options.shellExists ?? shellPathExists;
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

  const fallbackShell = login
    ? pickFirstExistingShell(["/bin/bash", "/bin/zsh", "/bin/sh"], shellExists)
    : pickFirstExistingShell(["/bin/sh", "/bin/bash", "/bin/zsh"], shellExists);

  return {
    shell: fallbackShell ?? "/bin/sh",
    shellArgs:
      login && fallbackShell && fallbackShell !== "/bin/sh" ? ["-lc", command] : ["-c", command],
  };
}

function sliceUtf8Head(text: string, maxBytes: number): string {
  return Buffer.from(text, "utf-8").subarray(0, maxBytes).toString("utf-8");
}

function sliceUtf8Tail(text: string, maxBytes: number): string {
  return Buffer.from(text, "utf-8").subarray(-maxBytes).toString("utf-8");
}

function appendWindowedCapture(current: WindowedCapture, chunk: string): WindowedCapture {
  if (!current.truncated) {
    const combined = `${current.head}${chunk}`;
    if (Buffer.byteLength(combined, "utf-8") <= MAX_CAPTURE_BYTES) {
      return { head: combined, tail: "", truncated: false };
    }

    return {
      head: sliceUtf8Head(combined, CAPTURE_SEGMENT_BYTES),
      tail: sliceUtf8Tail(combined, CAPTURE_SEGMENT_BYTES),
      truncated: true,
    };
  }

  return {
    head: current.head,
    tail: sliceUtf8Tail(`${current.tail}${chunk}`, CAPTURE_SEGMENT_BYTES),
    truncated: true,
  };
}

function finalizeWindowedCapture(capture: WindowedCapture, streamLabel: string): string {
  if (!capture.truncated) {
    return capture.head;
  }

  const marker = `\n[${streamLabel} truncated to first and last ${Math.floor(CAPTURE_SEGMENT_BYTES / 1024)} KiB]\n`;
  return `${capture.head}${marker}${capture.tail}`;
}

function killChildProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to killing the direct child below.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // Best effort only.
  }
}

export async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options: {
    timeoutMs?: number;
    stdinText?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ExecResult> {
  const { timeoutMs, stdinText, signal } = options;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: [stdinText !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout: WindowedCapture = { head: "", tail: "", truncated: false };
    let stderr: WindowedCapture = { head: "", tail: "", truncated: false };
    let settled = false;
    let forcedExitCode: number | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      cleanup();

      resolve({
        stdout: finalizeWindowedCapture(stdout, "stdout"),
        stderr: finalizeWindowedCapture(stderr, "stderr"),
        exitCode,
      });
    };

    const terminate = (message: string, exitCode: number) => {
      if (settled) return;
      forcedExitCode = exitCode;
      stderr = appendWindowedCapture(stderr, message);
      killChildProcess(child, "SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (settled) return;
        killChildProcess(child, "SIGKILL");
        finish(exitCode);
      }, 1000);
    };

    const onAbort = () => {
      terminate("\nCommand aborted", 130);
    };

    child.stdout?.on("data", (chunk) => {
      stdout = appendWindowedCapture(stdout, chunk.toString());
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendWindowedCapture(stderr, chunk.toString());
    });
    child.on("error", (error) => {
      if (settled) return;
      cleanup();
      reject(error);
    });
    child.on("close", (code) => finish(forcedExitCode ?? code ?? 1));

    if (stdinText !== undefined && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        terminate(`\nCommand timed out after ${timeoutMs}ms`, 124);
      }, timeoutMs);
    }
  });
}

export function conciseResult(title: string, detail?: string) {
  return new Text(detail ? `${title} ${detail}` : title, 0, 0);
}
