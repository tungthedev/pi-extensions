import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type { ExtensionManagerController } from "../controller/index.ts";
import type { ManagerAction, PaletteView } from "../types.ts";

import { StackPalette } from "../ui.ts";

export async function openManagerOverlay(
  ctx: ExtensionCommandContext,
  rootView: PaletteView,
): Promise<ManagerAction | null> {
  return ctx.ui.custom<ManagerAction | null>(
    (tui, theme, _kb, done) => {
      const palette = new StackPalette(rootView, theme, done, (error) => {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Extension manager error: ${message}`, "warning");
      }, () => tui.requestRender());
      return {
        render: (width: number) => palette.render(width),
        invalidate: () => palette.invalidate(),
        handleInput: (data: string) => {
          palette.handleInput(data);
          tui.requestRender();
        },
        get focused() {
          return palette.focused;
        },
        set focused(value: boolean) {
          palette.focused = value;
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "top-center",
        width: 96,
        minWidth: 48,
        maxHeight: "70%",
        offsetY: 2,
      },
    },
  );
}

export async function handleManagerAction(
  action: ManagerAction,
  controller: ExtensionManagerController,
  ctx: ExtensionCommandContext,
): Promise<"continue" | "done"> {
  if (action.type === "refresh") {
    await controller.refresh();
    return "continue";
  }

  if (action.type === "reload") {
    await ctx.reload();
    return "done";
  }

  if (action.type === "apply-local") {
    const result = await controller.applyLocalChanges();
    if (result.errors.length > 0) {
      ctx.ui.notify(`Applied ${result.changed} change(s).\n${result.errors.join("\n")}`, "warning");
    } else if (result.changed === 0) {
      ctx.ui.notify("No local changes to apply.", "info");
      return "continue";
    } else {
      ctx.ui.notify(`Applied ${result.changed} local extension change(s).`, "info");
    }

    if (result.changed > 0) {
      const shouldReload = await ctx.ui.confirm(
        "Reload Required",
        "Local extension state changed. Reload pi now?",
      );
      if (shouldReload) {
        await ctx.reload();
        return "done";
      }
    }

    await controller.refresh();
    return "continue";
  }

  if (action.type === "save-package" && action.packageId) {
    const result = await controller.savePackageChanges(action.packageId);
    if (result.errors.length > 0) {
      ctx.ui.notify(`Saved ${result.changed} change(s).\n${result.errors.join("\n")}`, "warning");
    } else if (result.changed === 0) {
      ctx.ui.notify("No package changes to save.", "info");
      return "continue";
    } else {
      ctx.ui.notify(`Saved ${result.changed} package extension change(s).`, "info");
    }

    if (result.changed > 0) {
      const shouldRestart = await ctx.ui.confirm(
        "Restart Recommended",
        "Package extension settings changed. Restart pi now to fully apply them?",
      );
      if (shouldRestart) {
        ctx.shutdown();
        return "done";
      }
    }

    await controller.refresh();
    return "continue";
  }

  return "continue";
}
