import type { InteractiveBackendContext } from "./types.ts";

function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function isCmuxRuntimeAvailable(ctx: InteractiveBackendContext): boolean {
  return !!ctx.env.CMUX_SOCKET_PATH && ctx.hasCommand("cmux");
}

export function createCmuxSurfaceSplit(
  ctx: InteractiveBackendContext,
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const surfaceArg = fromSurface ? ` --surface ${shellEscape(fromSurface)}` : "";
  const out = ctx.execSync(`cmux new-split ${direction}${surfaceArg}`, {
    encoding: "utf8",
  }).trim();
  const match = out.match(/surface:\d+/);
  if (!match) {
    throw new Error(`Unexpected cmux new-split output: ${out}`);
  }
  const surface = match[0];
  ctx.execSync(`cmux rename-tab --surface ${shellEscape(surface)} ${shellEscape(name)}`, {
    encoding: "utf8",
  });
  return surface;
}

export function createCmuxSurfaceInPane(
  ctx: InteractiveBackendContext,
  name: string,
  pane: string,
): string {
  const out = ctx.execSync(`cmux new-surface --pane ${shellEscape(pane)}`, {
    encoding: "utf8",
  }).trim();
  const match = out.match(/surface:\d+/);
  if (!match) {
    throw new Error(`Unexpected cmux new-surface output: ${out}`);
  }
  const surface = match[0];
  ctx.execSync(`cmux rename-tab --surface ${shellEscape(surface)} ${shellEscape(name)}`, {
    encoding: "utf8",
  });
  return surface;
}

export function sendCmuxText(ctx: InteractiveBackendContext, surface: string, text: string): void {
  ctx.execSync(`cmux send --surface ${shellEscape(surface)} ${shellEscape(text)}`, {
    encoding: "utf8",
  });
}

export async function readCmuxScreen(
  ctx: InteractiveBackendContext,
  surface: string,
  lines: number,
): Promise<string> {
  const { stdout } = await ctx.execFileAsync(
    "cmux",
    ["read-screen", "--surface", surface, "--lines", String(lines)],
    { encoding: "utf8" },
  );
  return stdout;
}

export function closeCmuxSurface(ctx: InteractiveBackendContext, surface: string): void {
  ctx.execSync(`cmux close-surface --surface ${shellEscape(surface)}`, {
    encoding: "utf8",
  });
}
