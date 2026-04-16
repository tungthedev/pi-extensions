import { join } from "node:path";

import type { InteractiveBackendContext } from "./types.ts";

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function tailLines(text: string, lines: number): string {
  const split = text.split("\n");
  if (split.length <= lines) return text;
  return split.slice(-lines).join("\n");
}

function zellijPaneId(surface: string): string {
  return surface.startsWith("pane:") ? surface.slice("pane:".length) : surface;
}

function zellijEnv(ctx: InteractiveBackendContext, surface?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...ctx.env };
  if (surface) {
    env.ZELLIJ_PANE_ID = zellijPaneId(surface);
  }
  return env;
}

function waitForFile(ctx: InteractiveBackendContext, filePath: string, timeoutMs = 5_000): string {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ctx.existsSync(filePath)) {
      return ctx.readFileSync(filePath, "utf8").trim();
    }
    Atomics.wait(sleeper, 0, 0, 20);
  }
  throw new Error(`Timed out waiting for zellij pane id file: ${filePath}`);
}

function zellijActionSync(
  ctx: InteractiveBackendContext,
  args: string[],
  surface?: string,
): string {
  return ctx.execFileSync("zellij", ["action", ...args], {
    encoding: "utf8",
    env: zellijEnv(ctx, surface),
  });
}

export function isZellijRuntimeAvailable(ctx: InteractiveBackendContext): boolean {
  return !!(ctx.env.ZELLIJ || ctx.env.ZELLIJ_SESSION_NAME) && ctx.hasCommand("zellij");
}

export function createZellijSurfaceSplit(
  ctx: InteractiveBackendContext,
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const directionArg = direction === "left" || direction === "right" ? "right" : "down";
  const tokenPath = join(
    ctx.tmpdir(),
    `pi-subagent-zellij-pane-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  const args = ["new-pane", "--direction", directionArg, "--name", name, "--cwd", ctx.cwd()];
  zellijActionSync(ctx, args, fromSurface);

  const captureIdCmd = `echo "$ZELLIJ_PANE_ID" > ${shellEscape(tokenPath)}`;
  zellijActionSync(ctx, ["write-chars", captureIdCmd], fromSurface);
  zellijActionSync(ctx, ["write", "13"], fromSurface);

  const paneId = waitForFile(ctx, tokenPath);
  try {
    ctx.rmSync(tokenPath, { force: true });
  } catch {
    // Ignore cleanup failure.
  }

  if (!paneId || !/^\d+$/.test(paneId)) {
    throw new Error(`Unexpected zellij pane id: ${paneId || "(empty)"}`);
  }

  const surface = `pane:${paneId}`;
  if (direction === "left" || direction === "up") {
    try {
      zellijActionSync(ctx, ["move-pane", direction], surface);
    } catch {
      // Optional.
    }
  }
  try {
    zellijActionSync(ctx, ["rename-pane", name], surface);
  } catch {
    // Optional.
  }
  return surface;
}

export function sendZellijText(
  ctx: InteractiveBackendContext,
  surface: string,
  text: string,
): void {
  zellijActionSync(ctx, ["write-chars", text], surface);
}

export function submitZellijInput(ctx: InteractiveBackendContext, surface: string): void {
  zellijActionSync(ctx, ["write", "13"], surface);
}

export async function readZellijScreen(
  ctx: InteractiveBackendContext,
  surface: string,
  lines: number,
): Promise<string> {
  const paneId = zellijPaneId(surface);
  const { stdout } = await ctx.execFileAsync(
    "zellij",
    ["action", "dump-screen", "--pane-id", paneId],
    { encoding: "utf8" },
  );
  return tailLines(stdout, lines);
}

export function closeZellijSurface(ctx: InteractiveBackendContext, surface: string): void {
  zellijActionSync(ctx, ["close-pane"], surface);
}
