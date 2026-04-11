import type { InteractiveBackendContext } from "./types.ts";

export function isTmuxRuntimeAvailable(ctx: InteractiveBackendContext): boolean {
  return !!ctx.env.TMUX && ctx.hasCommand("tmux");
}

export function createTmuxSurfaceSplit(
  ctx: InteractiveBackendContext,
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const args = ["split-window"];
  if (direction === "left" || direction === "right") args.push("-h");
  else args.push("-v");
  if (direction === "left" || direction === "up") args.push("-b");
  if (fromSurface) args.push("-t", fromSurface);
  args.push("-P", "-F", "#{pane_id}");

  const pane = ctx.execFileSync("tmux", args, { encoding: "utf8" }).trim();
  if (!pane.startsWith("%")) {
    throw new Error(`Unexpected tmux split-window output: ${pane}`);
  }
  try {
    ctx.execFileSync("tmux", ["select-pane", "-t", pane, "-T", name], { encoding: "utf8" });
  } catch {
    // Optional.
  }
  return pane;
}

export function sendTmuxText(ctx: InteractiveBackendContext, surface: string, text: string): void {
  ctx.execFileSync("tmux", ["send-keys", "-t", surface, "-l", text], { encoding: "utf8" });
}

export function submitTmuxInput(ctx: InteractiveBackendContext, surface: string): void {
  ctx.execFileSync("tmux", ["send-keys", "-t", surface, "Enter"], { encoding: "utf8" });
}

export async function readTmuxScreen(
  ctx: InteractiveBackendContext,
  surface: string,
  lines: number,
): Promise<string> {
  const { stdout } = await ctx.execFileAsync(
    "tmux",
    ["capture-pane", "-p", "-t", surface, "-S", `-${Math.max(1, lines)}`],
    { encoding: "utf8" },
  );
  return stdout;
}

export function closeTmuxSurface(ctx: InteractiveBackendContext, surface: string): void {
  ctx.execFileSync("tmux", ["kill-pane", "-t", surface], { encoding: "utf8" });
}
