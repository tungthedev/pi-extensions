import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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

type ManagedToolName = "fd" | "rg";

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

type ExecCommandOptions = {
  timeoutMs?: number;
  stdinText?: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

const CAPTURE_SEGMENT_BYTES = Math.floor(MAX_CAPTURE_BYTES / 2);

function normalizePathInput(input: string): string {
  const stripped = input.startsWith("@") ? input.slice(1) : input;
  const joinHomePath = (relativePath: string) =>
    path.join(os.homedir(), ...relativePath.split(/[\\/]+/).filter(Boolean));
  if (stripped === "~") return os.homedir();
  if (stripped.startsWith("~/")) return joinHomePath(stripped.slice(2));
  if (stripped.startsWith("~\\")) return joinHomePath(stripped.slice(2));
  return stripped;
}

export function truncateLine(text: string): string {
  return text.length > MAX_LINE_LENGTH ? `${text.slice(0, MAX_LINE_LENGTH)}...` : text;
}

export function trimToBudget(text: string): { text: string; truncated: boolean } {
  const lines = text.replace(/\r/g, "").split("\n");
  const visibleLines: string[] = [];
  let visibleBytes = 0;
  let truncated = false;

  for (const line of lines) {
    if (visibleLines.length >= DEFAULT_MAX_LINES) {
      truncated = true;
      break;
    }

    const candidate = truncateLine(line);
    const candidateBytes = Buffer.byteLength(`${candidate}\n`, "utf-8");
    if (visibleBytes + candidateBytes > DEFAULT_MAX_BYTES) {
      truncated = true;
      break;
    }

    visibleLines.push(candidate);
    visibleBytes += candidateBytes;
  }

  let output = visibleLines.join("\n");
  if (truncated) {
    output += "\n\n[Output truncated]";
  }

  return { text: output, truncated };
}

export function normalizeRipgrepGlob(pattern: string): string {
  return pattern.replace(/\\/g, "/");
}

function expandHomeDirectory(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), ...input.slice(2).split(/[\\/]+/).filter(Boolean));
  }

  return input;
}

export function getPiAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured) {
    return expandHomeDirectory(configured);
  }

  return path.join(os.homedir(), ".pi", "agent");
}

export function getPiBinDir(): string {
  return path.join(getPiAgentDir(), "bin");
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

export function resolvePiManagedToolPath(tool: ManagedToolName): string | undefined {
  const binaryName = process.platform === "win32" ? `${tool}.exe` : tool;
  const candidate = path.join(getPiBinDir(), binaryName);
  return pathExists(candidate) ? candidate : undefined;
}

export function resolveAbsolutePath(cwd: string, input: string): string {
  const normalized = normalizePathInput(input);
  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  return path.resolve(cwd, normalized);
}

function pathExists(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Some paths differ only by unicode normalization or the narrow no-break space
// that macOS may insert in localized date suffixes. Try a few safe variants.
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
    accessSync(shellPath, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function findExecutableOnPath(executable: string): string | undefined {
  const lookupExecutable =
    process.platform === "win32" && !path.extname(executable) ? `${executable}.exe` : executable;
  const resolver = process.platform === "win32" ? "where" : "which";

  try {
    const result = spawnSync(resolver, [lookupExecutable], {
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status !== 0 || !result.stdout) {
      return undefined;
    }

    for (const candidate of result.stdout.trim().split(/\r?\n/)) {
      if (candidate && shellPathExists(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Ignore lookup failures and let callers handle the fallback.
  }

  return undefined;
}

export function resolvePiToolPath(tool: ManagedToolName): string | undefined {
  return resolvePiManagedToolPath(tool) ?? findExecutableOnPath(tool);
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

const EXIT_STDIO_GRACE_MS = 100;

function createWindowedCapture(): WindowedCapture {
  return { head: "", tail: "", truncated: false };
}

function sliceUtf8Head(text: string, maxBytes: number): string {
  return Buffer.from(text, "utf-8").subarray(0, maxBytes).toString("utf-8");
}

function sliceUtf8Tail(text: string, maxBytes: number): string {
  return Buffer.from(text, "utf-8").subarray(-maxBytes).toString("utf-8");
}

// Keep the first window and last window of very large output so callers still
// see both the start of the stream and the most recent failure details.
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

function waitForChildProcess(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let exited = false;
    let exitCode: number | null = null;
    let postExitTimer: ReturnType<typeof setTimeout> | undefined;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;

    const cleanup = () => {
      if (postExitTimer) {
        clearTimeout(postExitTimer);
        postExitTimer = undefined;
      }

      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
    };

    const finalize = (code: number | null) => {
      if (settled) return;

      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(code);
    };

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) {
        finalize(exitCode);
      }
    };

    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };

    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };

    const onError = (error: Error) => {
      if (settled) return;

      settled = true;
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null) => {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) {
        postExitTimer = setTimeout(() => finalize(code), EXIT_STDIO_GRACE_MS);
      }
    };

    const onClose = (code: number | null) => {
      finalize(code);
    };

    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}

function killChildProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    if (!child.pid) {
      return;
    }

    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], {
        stdio: "ignore",
        detached: true,
      });
      return;
    } catch {
      // Fall back to killing the direct child below.
    }
  }

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

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer) {
    clearTimeout(timer);
  }

  return null;
}

function writeChildStdin(child: ChildProcess, stdinText: string | undefined): void {
  if (stdinText === undefined || !child.stdin) {
    return;
  }

  child.stdin.write(stdinText);
  child.stdin.end();
}

export async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options: ExecCommandOptions = {},
): Promise<ExecResult> {
  const { timeoutMs, stdinText, signal, env } = options;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env,
      stdio: [stdinText !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = createWindowedCapture();
    let stderr = createWindowedCapture();
    let settled = false;
    let forcedExitCode: number | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      timeoutTimer = clearTimer(timeoutTimer);
      forceKillTimer = clearTimer(forceKillTimer);
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
    void waitForChildProcess(child)
      .then((code) => {
        finish(forcedExitCode ?? code ?? 1);
      })
      .catch((error) => {
        if (settled) return;

        cleanup();
        reject(error);
      });

    writeChildStdin(child, stdinText);

    if (signal?.aborted) {
      onAbort();
    } else if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        terminate(`\nCommand timed out after ${timeoutMs}ms`, 124);
      }, timeoutMs);
    }
  });
}
