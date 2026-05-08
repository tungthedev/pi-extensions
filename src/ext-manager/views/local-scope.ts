import type { ExtensionManagerController } from "../controller/index.js";
import { createManagedEntriesView } from "../controller/entry-model.js";
import type { PaletteView } from "../types.js";

export function buildLocalScopeView(
  scope: "global" | "project",
  controller: ExtensionManagerController,
): PaletteView {
  const section = controller.localManagedEntries(scope);
  return {
    ...createManagedEntriesView(section),
    onResume: () => buildLocalScopeView(scope, controller),
  };
}
