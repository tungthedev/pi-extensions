import type { PaletteItem, PaletteView } from "../types.ts";
import type { ExtensionManagerController } from "../controller/index.ts";

export async function buildPackageView(
  packageId: string,
  controller: ExtensionManagerController,
): Promise<PaletteView> {
  const pkg = controller.packages.find((item) => item.id === packageId);
  const entries = await controller.ensurePackageEntries(packageId);
  const items: PaletteItem[] = [];

  if (entries.length === 0) {
    items.push({
      id: `empty:${packageId}`,
      label: "No extension entrypoints found",
      description: pkg?.source ?? "",
      category: "info",
      onSelect: () => undefined,
    });
  }

  for (const entry of entries) {
    const currentState = controller.currentPackageState(entry);
    const missing = entry.available ? "" : " [missing]";
    items.push({
      id: entry.id,
      label: `${currentState === "enabled" ? "●" : "○"} ${entry.extensionPath}${missing}`,
      description: entry.summary,
      category: currentState === "enabled" ? "on" : "off",
      shortcut: entry.available ? "space" : undefined,
      onSelect: () => undefined,
    });
  }

  if (pkg && controller.pendingPackageCount(packageId) > 0) {
    items.push({
      id: `save:${packageId}`,
      label: `💾 Save package changes (${controller.pendingPackageCount(packageId)})`,
      description: "Write package extension filters to settings.json",
      category: "save",
      shortcut: "s",
      onSelect: (ctx) => ctx.finish({ type: "save-package", packageId }),
    });
  }

  return {
    title: pkg ? `${pkg.name} extensions` : "Package extensions",
    items,
    footerHint: "space toggle • s save • esc back",
    handleKey: (data, ctx, selectedItem) => {
      if ((data === "s" || data === "S") && controller.pendingPackageCount(packageId) > 0) {
        ctx.finish({ type: "save-package", packageId });
        return true;
      }

      if (data === " " && selectedItem && !selectedItem.id.startsWith("save:")) {
        const selectedEntry = entries.find((entry) => entry.id === selectedItem.id);
        if (!selectedEntry || !selectedEntry.available) return true;
        controller.togglePackageEntry(packageId, selectedEntry.extensionPath);
        ctx.run(async () => {
          ctx.replace(await buildPackageView(packageId, controller), { preserveState: true });
        });
        return true;
      }

      return false;
    },
  };
}
