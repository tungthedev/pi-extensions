import type { ExtensionManagerController } from "../controller/index.ts";
import { createManagedEntriesView } from "../controller/entry-model.ts";
import type { PaletteView } from "../types.ts";

export async function buildPackageView(
  packageId: string,
  controller: ExtensionManagerController,
): Promise<PaletteView> {
  return createManagedEntriesView(await controller.packageManagedEntries(packageId));
}
