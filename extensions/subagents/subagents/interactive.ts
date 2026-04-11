import { basename } from "node:path";

import { createInteractiveContext } from "./interactive/context.ts";
import {
  closeCmuxSurface,
  createCmuxSurfaceSplit,
  isCmuxRuntimeAvailable,
  readCmuxScreen,
  sendCmuxText,
} from "./interactive/backends/cmux.ts";
import {
  closeTmuxSurface,
  createTmuxSurfaceSplit,
  isTmuxRuntimeAvailable,
  readTmuxScreen,
  sendTmuxText,
  submitTmuxInput,
} from "./interactive/backends/tmux.ts";
import type { InteractiveBackendContext, MuxBackend } from "./interactive/backends/types.ts";
import {
  closeWezTermSurface,
  createWezTermSurfaceSplit,
  isWezTermRuntimeAvailable,
  readWezTermScreen,
  sendWezTermText,
} from "./interactive/backends/wezterm.ts";
import {
  closeZellijSurface,
  createZellijSurfaceSplit,
  isZellijRuntimeAvailable,
  readZellijScreen,
  sendZellijText,
  submitZellijInput,
} from "./interactive/backends/zellij.ts";

function muxPreference(): MuxBackend | null {
  const pref = (process.env.PI_SUBAGENT_MUX ?? "").trim().toLowerCase();
  if (pref === "cmux" || pref === "tmux" || pref === "zellij" || pref === "wezterm") {
    return pref;
  }
  return null;
}

export function getMuxBackend(context = createInteractiveContext()): MuxBackend | null {
  const pref = muxPreference();
  if (pref === "cmux") return isCmuxRuntimeAvailable(context) ? "cmux" : null;
  if (pref === "tmux") return isTmuxRuntimeAvailable(context) ? "tmux" : null;
  if (pref === "zellij") return isZellijRuntimeAvailable(context) ? "zellij" : null;
  if (pref === "wezterm") return isWezTermRuntimeAvailable(context) ? "wezterm" : null;

  if (isCmuxRuntimeAvailable(context)) return "cmux";
  if (isTmuxRuntimeAvailable(context)) return "tmux";
  if (isZellijRuntimeAvailable(context)) return "zellij";
  if (isWezTermRuntimeAvailable(context)) return "wezterm";
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

function requireMuxBackend(context = createInteractiveContext()): MuxBackend {
  const backend = getMuxBackend(context);
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

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
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

export function createSurface(name: string): string {
  return createSurfaceSplit(name, "right");
}

export function createSurfaceSplit(
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const context = createInteractiveContext();
  const backend = requireMuxBackend(context);

  if (backend === "cmux") {
    return createCmuxSurfaceSplit(context, name, direction, fromSurface);
  }
  if (backend === "tmux") {
    return createTmuxSurfaceSplit(context, name, direction, fromSurface);
  }
  if (backend === "wezterm") {
    return createWezTermSurfaceSplit(context, name, direction, fromSurface);
  }
  return createZellijSurfaceSplit(context, name, direction, fromSurface);
}

function sendText(context: InteractiveBackendContext, backend: MuxBackend, surface: string, text: string) {
  if (backend === "cmux") {
    sendCmuxText(context, surface, text);
    return;
  }
  if (backend === "tmux") {
    sendTmuxText(context, surface, text);
    return;
  }
  if (backend === "wezterm") {
    sendWezTermText(context, surface, text);
    return;
  }
  sendZellijText(context, surface, text);
}

export function sendShellCommand(surface: string, command: string): void {
  const context = createInteractiveContext();
  const backend = requireMuxBackend(context);
  sendText(context, backend, surface, command);
  sendInteractiveInput(surface, "", { submit: true });
}

export function sendInteractiveInput(
  surface: string,
  text: string,
  options: { submit?: boolean } = {},
): void {
  const context = createInteractiveContext();
  const backend = requireMuxBackend(context);

  if (text.length > 0) {
    sendText(context, backend, surface, text);
  }

  if (options.submit === false) {
    return;
  }

  if (backend === "cmux") {
    sendCmuxText(context, surface, "\n");
    return;
  }
  if (backend === "tmux") {
    submitTmuxInput(context, surface);
    return;
  }
  if (backend === "wezterm") {
    sendWezTermText(context, surface, "\n");
    return;
  }
  submitZellijInput(context, surface);
}

async function readScreenAsync(surface: string, lines = 50): Promise<string> {
  const context = createInteractiveContext();
  const backend = requireMuxBackend(context);

  if (backend === "cmux") {
    return await readCmuxScreen(context, surface, lines);
  }
  if (backend === "tmux") {
    return await readTmuxScreen(context, surface, lines);
  }
  if (backend === "wezterm") {
    return await readWezTermScreen(context, surface, lines);
  }
  return await readZellijScreen(context, surface, lines);
}

export function closeSurface(surface: string): void {
  const context = createInteractiveContext();
  const backend = requireMuxBackend(context);

  if (backend === "cmux") {
    closeCmuxSurface(context, surface);
    return;
  }
  if (backend === "tmux") {
    closeTmuxSurface(context, surface);
    return;
  }
  if (backend === "wezterm") {
    closeWezTermSurface(context, surface);
    return;
  }

  closeZellijSurface(context, surface);
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
