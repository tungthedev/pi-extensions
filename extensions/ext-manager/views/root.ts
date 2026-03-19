import type { ExtensionManagerController } from "../controller/index.ts";
import type { PaletteItem, PaletteView } from "../types.ts";

import { buildLocalScopeView } from "./local-scope.ts";
import { buildPackagesView } from "./packages.ts";

export function buildRootView(controller: ExtensionManagerController): PaletteView {
  const projectCount = controller.localEntriesForScope("project").length;
  const globalCount = controller.localEntriesForScope("global").length;
  const pendingLocal = controller.pendingLocalCount();
  const items: PaletteItem[] = [
    {
      id: "project",
      label: `🗂  Project extensions (${projectCount})`,
      description:
        pendingLocal > 0
          ? `Repo-local extensions • ${pendingLocal} staged local change${pendingLocal === 1 ? "" : "s"}`
          : "Repo-local extensions discovered under .pi/extensions",
      category: "project",
      shortcut: "enter",
      onSelect: (ctx) => ctx.push(buildLocalScopeView("project", controller)),
    },
    {
      id: "global",
      label: `🌐 Global extensions (${globalCount})`,
      description: "Extensions discovered under ~/.pi/agent/extensions",
      category: "global",
      shortcut: "enter",
      onSelect: (ctx) => ctx.push(buildLocalScopeView("global", controller)),
    },
    {
      id: "packages",
      label: `📦 Installed packages (${controller.packages.length})`,
      description: "Inspect package-provided extension entrypoints and filters",
      category: "pkg",
      shortcut: "enter",
      onSelect: (ctx) => ctx.push(buildPackagesView(controller)),
    },
  ];

  if (pendingLocal > 0) {
    items.push({
      id: "apply-local",
      label: `💾 Save local changes (${pendingLocal})`,
      description: "Apply staged local extension toggles and reload pi",
      category: "save",
      shortcut: "s",
      onSelect: (ctx) => ctx.finish({ type: "apply-local" }),
    });
  }

  items.push({
    id: "refresh",
    label: "↻ Refresh inventory",
    description: "Rescan local extensions and installed packages",
    category: "action",
    shortcut: "enter",
    onSelect: (ctx) => ctx.finish({ type: "refresh" }),
  });

  items.push({
    id: "reload",
    label: "⟳ Reload pi",
    description: "Reload extensions, skills, prompts, and themes",
    category: "action",
    shortcut: "enter",
    onSelect: (ctx) => ctx.finish({ type: "reload" }),
  });

  return {
    title: "Extension manager",
    items,
    footerHint:
      pendingLocal > 0 ? "enter open • s save local • esc close" : "enter open • esc close",
    onResume: () => buildRootView(controller),
    handleKey: (data, ctx) => {
      if ((data === "s" || data === "S") && pendingLocal > 0) {
        ctx.finish({ type: "apply-local" });
        return true;
      }

      return false;
    },
  };
}
