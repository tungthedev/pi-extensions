import { Text } from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
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

function normalizePath(input: string): string {
  return input.startsWith("@") ? input.slice(1) : input;
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

function appendBoundedCapture(
  current: string,
  chunk: string,
): {
  text: string;
  truncated: boolean;
} {
  const combined = `${current}${chunk}`;
  if (Buffer.byteLength(combined, "utf-8") <= MAX_CAPTURE_BYTES) {
    return { text: combined, truncated: false };
  }

  const tail = Buffer.from(combined, "utf-8").subarray(-MAX_CAPTURE_BYTES).toString("utf-8");
  return { text: tail, truncated: true };
}

export function resolveAbsolutePath(cwd: string, input: string): string {
  const normalized = normalizePath(input);
  return path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
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
  const login = options.login !== false;
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
      stdio: [stdinText !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
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

      if (stdoutTruncated) {
        stdout += "\n[stdout truncated to last 256 KiB]";
      }
      if (stderrTruncated) {
        stderr += "\n[stderr truncated to last 256 KiB]";
      }

      resolve({ stdout, stderr, exitCode });
    };

    const terminate = (message: string, exitCode: number) => {
      if (settled) return;
      stderr += message;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (settled) return;
        child.kill("SIGKILL");
        finish(exitCode);
      }, 1000);
    };

    const onAbort = () => {
      terminate("\nCommand aborted", 130);
    };

    child.stdout?.on("data", (chunk) => {
      const next = appendBoundedCapture(stdout, chunk.toString());
      stdout = next.text;
      stdoutTruncated ||= next.truncated;
    });
    child.stderr?.on("data", (chunk) => {
      const next = appendBoundedCapture(stderr, chunk.toString());
      stderr = next.text;
      stderrTruncated ||= next.truncated;
    });
    child.on("error", (error) => {
      if (settled) return;
      cleanup();
      reject(error);
    });
    child.on("close", (code) => finish(code ?? 1));

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
