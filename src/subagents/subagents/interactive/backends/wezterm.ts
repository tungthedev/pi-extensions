import type { InteractiveBackendContext } from "./types.ts";

function tailLines(text: string, lines: number): string {
  const split = text.split("\n");
  if (split.length <= lines) return text;
  return split.slice(-lines).join("\n");
}

export function isWezTermRuntimeAvailable(ctx: InteractiveBackendContext): boolean {
  return !!ctx.env.WEZTERM_UNIX_SOCKET && ctx.hasCommand("wezterm");
}

export function createWezTermSurfaceSplit(
  ctx: InteractiveBackendContext,
  name: string,
  direction: "left" | "right" | "up" | "down",
  fromSurface?: string,
): string {
  const args = ["cli", "split-pane"];
  if (direction === "left") args.push("--left");
  else if (direction === "right") args.push("--right");
  else if (direction === "up") args.push("--top");
  else args.push("--bottom");
  args.push("--cwd", ctx.cwd());
  if (fromSurface) args.push("--pane-id", fromSurface);
  const paneId = ctx.execFileSync("wezterm", args, { encoding: "utf8" }).trim();
  if (!paneId || !/^\d+$/.test(paneId)) {
    throw new Error(`Unexpected wezterm split-pane output: ${paneId || "(empty)"}`);
  }
  try {
    ctx.execFileSync("wezterm", ["cli", "set-tab-title", "--pane-id", paneId, name], {
      encoding: "utf8",
    });
  } catch {
    // Optional.
  }
  return paneId;
}

export function sendWezTermText(
  ctx: InteractiveBackendContext,
  surface: string,
  text: string,
): void {
  ctx.execFileSync("wezterm", ["cli", "send-text", "--pane-id", surface, "--no-paste", text], {
    encoding: "utf8",
  });
}

export async function readWezTermScreen(
  ctx: InteractiveBackendContext,
  surface: string,
  lines: number,
): Promise<string> {
  const { stdout } = await ctx.execFileAsync(
    "wezterm",
    ["cli", "get-text", "--pane-id", surface],
    { encoding: "utf8" },
  );
  return tailLines(stdout, lines);
}

export function closeWezTermSurface(ctx: InteractiveBackendContext, surface: string): void {
  ctx.execFileSync("wezterm", ["cli", "kill-pane", "--pane-id", surface], {
    encoding: "utf8",
  });
}
