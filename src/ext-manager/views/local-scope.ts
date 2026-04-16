import type { ExtensionManagerController } from "../controller/index.ts";
import { createManagedEntriesView } from "../controller/entry-model.ts";
import type { PaletteView } from "../types.ts";

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
