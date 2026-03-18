import type { ExtensionManagerController } from "../controller/index.ts";
import type { LocalExtensionEntry, PaletteItem, PaletteView, State } from "../types.ts";

function localLabel(entry: LocalExtensionEntry, currentState: State): string {
  const icon = currentState === "enabled" ? "●" : "○";
  return `${icon} ${entry.displayName}`;
}

export function buildLocalScopeView(
  scope: "global" | "project",
  controller: ExtensionManagerController,
): PaletteView {
  const entries = controller.localEntriesForScope(scope);
  const items: PaletteItem[] = [];

  if (entries.length === 0) {
    items.push({
      id: `empty:${scope}`,
      label: `No ${scope} extensions found`,
      description: scope === "global" ? "~/.pi/agent/extensions" : ".pi/extensions",
      category: "info",
      onSelect: () => undefined,
    });
  }

  for (const entry of entries) {
    const currentState = controller.currentLocalState(entry);
    items.push({
      id: entry.id,
      label: localLabel(entry, currentState),
      description: entry.summary,
      category: currentState === "enabled" ? scope : `${scope} off`,
      shortcut: "space",
      onSelect: () => undefined,
    });
  }

  if (controller.pendingLocalCount() > 0) {
    items.push({
      id: `apply:${scope}`,
      label: `💾 Save local changes (${controller.pendingLocalCount()})`,
      description: "Rename extension entrypoints and reload pi",
      category: "save",
      shortcut: "s",
      onSelect: (ctx) => ctx.finish({ type: "apply-local" }),
    });
  }

  return {
    title: scope === "global" ? "Global extensions" : "Project extensions",
    items,
    footerHint: "space toggle • s save • esc back",
    onResume: () => buildLocalScopeView(scope, controller),
    handleKey: (data, ctx, selectedItem) => {
      if ((data === "s" || data === "S") && controller.pendingLocalCount() > 0) {
        ctx.finish({ type: "apply-local" });
        return true;
      }

      if (data === " " && selectedItem && !selectedItem.id.startsWith("apply:")) {
        const selectedEntry = entries.find((entry) => entry.id === selectedItem.id);
        if (!selectedEntry) return true;
        controller.toggleLocal(selectedEntry.id);
        ctx.replace(buildLocalScopeView(scope, controller), { preserveState: true });
        return true;
      }

      return false;
    },
  };
}
