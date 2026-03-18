import type { PaletteItem, PaletteView } from "../types.ts";
import type { ExtensionManagerController } from "../controller/index.ts";
import type { InstalledPackage } from "../types.ts";
import { buildPackageView } from "./package-detail.ts";

function packageLabel(pkg: InstalledPackage): string {
  return `📦 ${pkg.name}`;
}

export function buildPackagesView(controller: ExtensionManagerController): PaletteView {
  const items: PaletteItem[] = [];

  if (controller.packages.length === 0) {
    items.push({
      id: "no-packages",
      label: "No installed packages",
      description: "pi list returned no package entries",
      category: "info",
      onSelect: () => undefined,
    });
  }

  for (const pkg of controller.packages) {
    items.push({
      id: pkg.id,
      label: packageLabel(pkg),
      description: `${pkg.scope} • ${pkg.source}`,
      category: pkg.scope,
      onSelect: async (ctx) => {
        ctx.push(await buildPackageView(pkg.id, controller));
      },
    });
  }

  return {
    title: `Installed packages (${controller.packages.length})`,
    items,
    footerHint: "enter open package • esc back",
    onResume: () => buildPackagesView(controller),
  };
}
