import type { PaletteView, Scope } from "../../types.js";
import type { ExtensionManagerController } from "../index.js";
import type { ManagedEntrySection } from "../entry-model.js";

import { createManagedEntriesView } from "../entry-model.js";

export function buildLocalManagedEntrySection(
  scope: Scope,
  controller: ExtensionManagerController,
): ManagedEntrySection {
  const entries = controller.localEntriesForScope(scope).map((entry) => {
    const currentState = controller.currentLocalState(entry);
    return {
      id: entry.id,
      displayName: entry.displayName,
      summary: entry.summary,
      currentState,
      category: currentState === "enabled" ? scope : `${scope} off`,
      available: true,
    };
  });

  return {
    title: scope === "global" ? "Global extensions" : "Project extensions",
    emptyLabel: `No ${scope} extensions found`,
    emptyDescription: scope === "global" ? "~/.pi/agent/extensions" : ".pi/extensions",
    entries,
    pendingCount: controller.pendingLocalCount(),
    saveAction:
      controller.pendingLocalCount() > 0
        ? {
            type: "apply-local",
          }
        : undefined,
    saveLabel: `💾 Save local changes (${controller.pendingLocalCount()})`,
    saveDescription: "Rename extension entrypoints and reload pi",
    footerHint: "space toggle • s save • esc back",
    toggle: (entryId) => {
      controller.toggleLocal(entryId);
    },
    refreshView: (): PaletteView =>
      createManagedEntriesView(buildLocalManagedEntrySection(scope, controller)),
  };
}
