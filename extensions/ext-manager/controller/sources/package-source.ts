import type { ExtensionManagerController } from "../index.ts";
import type { ManagedEntrySection } from "../entry-model.ts";

import { createManagedEntriesView } from "../entry-model.ts";

export async function buildPackageManagedEntrySection(
  packageId: string,
  controller: ExtensionManagerController,
): Promise<ManagedEntrySection> {
  const pkg = controller.packages.find((item) => item.id === packageId);
  const entries = await controller.ensurePackageEntries(packageId);

  return {
    title: pkg ? `${pkg.name} extensions` : "Package extensions",
    emptyLabel: "No extension entrypoints found",
    emptyDescription: pkg?.source ?? "",
    entries: entries.map((entry) => {
      const currentState = controller.currentPackageState(entry);
      return {
        id: entry.id,
        displayName: entry.extensionPath,
        summary: entry.summary,
        currentState,
        category: currentState === "enabled" ? "on" : "off",
        available: entry.available,
      };
    }),
    pendingCount: controller.pendingPackageCount(packageId),
    saveAction:
      pkg && controller.pendingPackageCount(packageId) > 0
        ? {
            type: "save-package",
            packageId,
          }
        : undefined,
    saveLabel: `💾 Save package changes (${controller.pendingPackageCount(packageId)})`,
    saveDescription: "Write package extension filters to settings.json",
    footerHint: "space toggle • s save • esc back",
    toggle: (entryId) => {
      const entry = entries.find((item) => item.id === entryId);
      if (!entry || !entry.available) return;
      controller.togglePackageEntry(packageId, entry.extensionPath);
    },
    refreshView: async () =>
      createManagedEntriesView(await buildPackageManagedEntrySection(packageId, controller)),
  };
}
