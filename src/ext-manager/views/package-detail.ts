import type { ExtensionManagerController } from "../controller/index.js";
import { createManagedEntriesView } from "../controller/entry-model.js";
import type { PaletteView } from "../types.js";

export async function buildPackageView(
  packageId: string,
  controller: ExtensionManagerController,
): Promise<PaletteView> {
  return createManagedEntriesView(await controller.packageManagedEntries(packageId));
}
