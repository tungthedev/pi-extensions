import { execSync, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const execFileAsync = promisify(execFile);

export type MuxBackend = "cmux" | "tmux" | "zellij" | "wezterm";

const commandAvailability = new Map<string, boolean>();

function hasCommand(command: string): boolean {
  if (commandAvailability.has(command)) {
    return commandAvailability.get(command)!;
  }

  let available = false;
  try {
    execSync(`command -v ${command}`, { stdio: "ignore" });
    available = true;
  } catch {
    available = false;
  }

  commandAvailability.set(command, available);
  return available;
}

function muxPreference(): MuxBackend | null {
  const pref = (process.env.PI_SUBAGENT_MUX ?? "").trim().toLowerCase();
  if (pref === "cmux" || pref === "tmux" || pref === "zellij" || pref === "wezterm") {
    return pref;
  }
  return null;
}

function isCmuxRuntimeAvailable(): boolean {
  return !!process.env.CMUX_SOCKET_PATH && hasCommand("cmux");
}

function isTmuxRuntimeAvailable(): boolean {
  return !!process.env.TMUX && hasCommand("tmux");
}

function isZellijRuntimeAvailable(): boolean {
  return !!(process.env.ZELLIJ || process.env.ZELLIJ_SESSION_NAME) && hasCommand("zellij");
}

function isWezTermRuntimeAvailable(): boolean {
  return !!process.env.WEZTERM_UNIX_SOCKET && hasCommand("wezterm");
}

export function getMuxBackend(): MuxBackend | null {
  const pref = muxPreference();
  if (pref === "cmux") return isCmuxRuntimeAvailable() ? "cmux" : null;
  if (pref === "tmux") return isTmuxRuntimeAvailable() ? "tmux" : null;
  if (pref === "zellij") return isZellijRuntimeAvailable() ? "zellij" : null;
  if (pref === "wezterm") return isWezTermRuntimeAvailable() ? "wezterm" : null;

  if (isCmuxRuntimeAvailable()) return "cmux";
  if (isTmuxRuntimeAvailable()) return "tmux";
  if (isZellijRuntimeAvailable()) return "zellij";
  if (isWezTermRuntimeAvailable()) return "wezterm";
  return null;
}

export function isMuxAvailable(): boolean {
  return getMuxBackend() !== null;
}

export function muxSetupHint(): string {
  const pref = muxPreference();
  if (pref === "cmux") return "Start pi inside cmux (`cmux pi`).";
  if (pref === "tmux") return "Start pi inside tmux (`tmux new -A -s pi 'pi'`).";
  if (pref === "zellij") return "Start pi inside zellij (`zellij --session pi`, then run `pi`).";
  if (pref === "wezterm") return "Start pi inside WezTerm.";
  return "Start pi inside cmux (`cmux pi`), tmux (`tmux new -A -s pi 'pi'`), zellij (`zellij --session pi`, then run `pi`), or WezTerm.";
}

function requireMuxBackend(): MuxBackend {
  const backend = getMuxBackend();
  if (!backend) {
    throw new Error(`No supported terminal multiplexer found. ${muxSetupHint()}`);
  }
  return backend;
}

export type ShellFamily = "posix" | "fish" | "nu";

export function detectShellFamily(shell = process.env.SHELL ?? ""): ShellFamily {
  const shellName = basename(shell).toLowerCase();
  if (shellName === "nu" || shellName === "nu.exe") {
    return "nu";
  }
  if (shellName === "fish" || shellName === "fish.exe") {
    return "fish";
  }
  return "posix";
}

export function isFishShell(shell = process.env.SHELL ?? ""): boolean {
  return detectShellFamily(shell) === "fish";
}

export function isNuShell(shell = process.env.SHELL ?? ""): boolean {
  return detectShellFamily(shell) === "nu";
}

export function exitStatusVar(shell = process.env.SHELL ?? ""): string {
  const family = detectShellFamily(shell);
  if (family === "nu") return "$env.LAST_EXIT_CODE";
  if (family === "fish") return "$status";
  return "$?";
}

export function shellDoneSentinelCommand(shell = process.env.SHELL ?? ""): string {
  const family = detectShellFamily(shell);
  if (family === "nu") {
    return "print $'__SUBAGENT_DONE_($env.LAST_EXIT_CODE)__'";
  }
  return `echo '__SUBAGENT_DONE_'${exitStatusVar(shell)}'__'`;
}

export function shellExternalCommand(
  command: string,
  args: string[],
  shell = process.env.SHELL ?? "",
): string {
  const escaped = [command, ...args].map((part) => shellEscape(part));
  if (detectShellFamily(shell) === "nu") {
    const [head, ...tail] = escaped;
    return [`^${head}`, ...tail].join(" ");
  }
  return escaped.join(" ");
}

const INTERACTIVE_ENV_PREFIXES = ["_AI_GATEWAY_", "GEMINI_", "CLOUDFLARE_"] as const;

export function shellCdPrefix(cwd: string, shell = process.env.SHELL ?? ""): string {
  return isNuShell(shell) ? `cd ${shellEscape(cwd)}; ` : `cd ${shellEscape(cwd)} && `;
}

export function selectPreservedInteractiveEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const preserved: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (
      typeof value === "string" &&
      INTERACTIVE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      preserved[key] = value;
    }
  }

  return preserved;
}

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function tailLines(text: string, lines: number): string {
  const split = text.split("\n");
  if (split.length <= lines) return text;
  return split.slice(-lines).join("\n");
}

function zellijPaneId(surface: string): string {
  return surface.startsWith("pane:") ? surface.slice("pane:".length) : surface;
}

function zellijEnv(surface?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (surface) {
    env.ZELLIJ_PANE_ID = zellijPaneId(surface);
  }
  return env;
}

function waitForFile(path: string, timeoutMs = 5_000): string {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(path)) {
      return readFileSync(path, "utf8").trim();
    }
    Atomics.wait(sleeper, 0, 0, 20);
  }
  throw new Error(`Timed out waiting for zellij pane id file: ${path}`);
}

function zellijActionSync(args: string[], surface?: string): string {
  return execFileSync("zellij", ["action", ...args], {
    encoding: "utf8",
    env: zellijEnv(surface),
  });
}

let cmuxSubagentPane: string | null = null;

export function createSurface(name: string): string {
  const backend = getMuxBackend();

  if (backend === "cmux" && cmuxSubagentPane) {
    try {
      const tree = execSync("cmux tree", { encoding: "utf8" });
      if (tree.includes(cmuxSubagentPane)) {
        return createSurfaceInPane(name, cmuxSubagentPane);
      }
    } catch {
      // Fall through and create a new split.
    }
    cmuxSubagentPane = null;
  }

  const surface = createSurfaceSplit(name, "right");
  if (backend === "cmux") {
    try {
      const info = execSync(`cmux identify --surface ${shellEscape(surface)}`, {
        encoding: "utf8",
      });
      const parsed = JSON.parse(info);
      const paneRef = parsed?.caller?.pane_ref;
      if (paneRef) {
        cmuxSubagentPane = paneRef;
      }
    } catch {
      // Optional.
    }
  }

  return surface;
}

function createSurfaceInPane(name: string, pane: string): string {
  const out = execSync(`cmux new-surface --pane ${shellEscape(pane)}`, {
    encoding: "utf8",
  }).trim();
  const match = out.match(/surface:\d+/);
  if (!match) {
    throw new Error(`Unexpected cmux new-surface output: ${out}`);
  }
  const surface = match[0];
  execSync(`cmux rename-tab --surface ${shellEscape(surface)} ${shellEscape(name)}`, {
    encoding: "utf8",
  });
  return surface;
}

export function createSurfaceSplit(
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const backend = requireMuxBackend();

  if (backend === "cmux") {
    const surfaceArg = fromSurface ? ` --surface ${shellEscape(fromSurface)}` : "";
    const out = execSync(`cmux new-split ${direction}${surfaceArg}`, {
      encoding: "utf8",
    }).trim();
    const match = out.match(/surface:\d+/);
    if (!match) {
      throw new Error(`Unexpected cmux new-split output: ${out}`);
    }
    const surface = match[0];
    execSync(`cmux rename-tab --surface ${shellEscape(surface)} ${shellEscape(name)}`, {
      encoding: "utf8",
    });
    return surface;
  }

  if (backend === "tmux") {
    const args = ["split-window"];
    if (direction === "left" || direction === "right") args.push("-h");
    else args.push("-v");
    if (direction === "left" || direction === "up") args.push("-b");
    if (fromSurface) args.push("-t", fromSurface);
    args.push("-P", "-F", "#{pane_id}");

    const pane = execFileSync("tmux", args, { encoding: "utf8" }).trim();
    if (!pane.startsWith("%")) {
      throw new Error(`Unexpected tmux split-window output: ${pane}`);
    }
    try {
      execFileSync("tmux", ["select-pane", "-t", pane, "-T", name], { encoding: "utf8" });
    } catch {
      // Optional.
    }
    return pane;
  }

  if (backend === "wezterm") {
    const args = ["cli", "split-pane"];
    if (direction === "left") args.push("--left");
    else if (direction === "right") args.push("--right");
    else if (direction === "up") args.push("--top");
    else args.push("--bottom");
    args.push("--cwd", process.cwd());
    if (fromSurface) args.push("--pane-id", fromSurface);
    const paneId = execFileSync("wezterm", args, { encoding: "utf8" }).trim();
    if (!paneId || !/^\d+$/.test(paneId)) {
      throw new Error(`Unexpected wezterm split-pane output: ${paneId || "(empty)"}`);
    }
    try {
      execFileSync("wezterm", ["cli", "set-tab-title", "--pane-id", paneId, name], {
        encoding: "utf8",
      });
    } catch {
      // Optional.
    }
    return paneId;
  }

  const directionArg = direction === "left" || direction === "right" ? "right" : "down";
  const tokenPath = join(
    tmpdir(),
    `pi-subagent-zellij-pane-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  const args = ["new-pane", "--direction", directionArg, "--name", name, "--cwd", process.cwd()];
  zellijActionSync(args, fromSurface);

  const captureIdCmd = `echo "$ZELLIJ_PANE_ID" > ${shellEscape(tokenPath)}`;
  zellijActionSync(["write-chars", captureIdCmd]);
  zellijActionSync(["write", "13"]);

  const paneId = waitForFile(tokenPath);
  try {
    rmSync(tokenPath, { force: true });
  } catch {
    // Ignore cleanup failure.
  }

  if (!paneId || !/^\d+$/.test(paneId)) {
    throw new Error(`Unexpected zellij pane id: ${paneId || "(empty)"}`);
  }

  const surface = `pane:${paneId}`;
  if (direction === "left" || direction === "up") {
    try {
      zellijActionSync(["move-pane", direction], surface);
    } catch {
      // Optional.
    }
  }
  try {
    zellijActionSync(["rename-pane", name], surface);
  } catch {
    // Optional.
  }
  return surface;
}

function writeSurface(surface: string, text: string): void {
  const backend = requireMuxBackend();

  if (backend === "cmux") {
    execSync(`cmux send --surface ${shellEscape(surface)} ${shellEscape(text)}`, {
      encoding: "utf8",
    });
    return;
  }

  if (backend === "tmux") {
    execFileSync("tmux", ["send-keys", "-t", surface, "-l", text], { encoding: "utf8" });
    return;
  }

  if (backend === "wezterm") {
    execFileSync("wezterm", ["cli", "send-text", "--pane-id", surface, "--no-paste", text], {
      encoding: "utf8",
    });
    return;
  }

  zellijActionSync(["write-chars", text], surface);
}

export function sendShellCommand(surface: string, command: string): void {
  writeSurface(surface, command);
  sendInteractiveInput(surface, "", { submit: true });
}

export function sendInteractiveInput(
  surface: string,
  text: string,
  options: { submit?: boolean } = {},
): void {
  if (text.length > 0) {
    writeSurface(surface, text);
  }

  if (options.submit === false) {
    return;
  }

  const backend = requireMuxBackend();
  if (backend === "cmux") {
    execSync(`cmux send --surface ${shellEscape(surface)} ${shellEscape("\n")}`, {
      encoding: "utf8",
    });
    return;
  }
  if (backend === "tmux") {
    execFileSync("tmux", ["send-keys", "-t", surface, "Enter"], { encoding: "utf8" });
    return;
  }
  if (backend === "wezterm") {
    execFileSync("wezterm", ["cli", "send-text", "--pane-id", surface, "--no-paste", "\n"], {
      encoding: "utf8",
    });
    return;
  }
  zellijActionSync(["write", "13"], surface);
}

async function readScreenAsync(surface: string, lines = 50): Promise<string> {
  const backend = requireMuxBackend();

  if (backend === "cmux") {
    const { stdout } = await execFileAsync(
      "cmux",
      ["read-screen", "--surface", surface, "--lines", String(lines)],
      { encoding: "utf8" },
    );
    return stdout;
  }

  if (backend === "tmux") {
    const { stdout } = await execFileAsync(
      "tmux",
      ["capture-pane", "-p", "-t", surface, "-S", `-${Math.max(1, lines)}`],
      { encoding: "utf8" },
    );
    return stdout;
  }

  if (backend === "wezterm") {
    const { stdout } = await execFileAsync(
      "wezterm",
      ["cli", "get-text", "--pane-id", surface],
      { encoding: "utf8" },
    );
    return tailLines(stdout, lines);
  }

  const paneId = zellijPaneId(surface);
  const { stdout } = await execFileAsync(
    "zellij",
    ["action", "dump-screen", "--pane-id", paneId],
    { encoding: "utf8" },
  );
  return tailLines(stdout, lines);
}

export function closeSurface(surface: string): void {
  const backend = requireMuxBackend();

  if (backend === "cmux") {
    execSync(`cmux close-surface --surface ${shellEscape(surface)}`, {
      encoding: "utf8",
    });
    return;
  }
  if (backend === "tmux") {
    execFileSync("tmux", ["kill-pane", "-t", surface], { encoding: "utf8" });
    return;
  }
  if (backend === "wezterm") {
    execFileSync("wezterm", ["cli", "kill-pane", "--pane-id", surface], {
      encoding: "utf8",
    });
    return;
  }

  zellijActionSync(["close-pane"], surface);
}

export async function pollForExit(
  surface: string,
  signal: AbortSignal,
  options: { interval: number; onTick?: (elapsed: number) => void },
): Promise<number> {
  const start = Date.now();

  while (true) {
    if (signal.aborted) {
      throw new Error("Aborted while waiting for interactive child to finish");
    }

    const screen = await readScreenAsync(surface, 5);
    const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
    if (match) {
      return parseInt(match[1], 10);
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    options.onTick?.(elapsed);

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Aborted"));
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, options.interval);
      function onAbort() {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
