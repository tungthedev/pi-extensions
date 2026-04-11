import type { ManagerAction, PaletteItem, PaletteView, State } from "../types.ts";

export type ManagedEntry = {
  id: string;
  displayName: string;
  summary: string;
  currentState: State;
  category: string;
  available: boolean;
};

export type ManagedEntrySection = {
  title: string;
  emptyLabel: string;
  emptyDescription: string;
  entries: ManagedEntry[];
  pendingCount: number;
  saveAction?: ManagerAction;
  saveLabel?: string;
  saveDescription?: string;
  footerHint: string;
  toggle: (entryId: string) => void;
  refreshView: () => PaletteView | Promise<PaletteView>;
};

export function formatManagedEntryLabel(
  displayName: string,
  currentState: State,
  options: { available?: boolean } = {},
): string {
  const icon = currentState === "enabled" ? "●" : "○";
  const missing = options.available === false ? " [missing]" : "";
  return `${icon} ${displayName}${missing}`;
}

export function buildManagedEntryItems(section: ManagedEntrySection): PaletteItem[] {
  const items: PaletteItem[] = [];

  if (section.entries.length === 0) {
    items.push({
      id: `empty:${section.title}`,
      label: section.emptyLabel,
      description: section.emptyDescription,
      category: "info",
      onSelect: () => undefined,
    });
  }

  for (const entry of section.entries) {
    items.push({
      id: entry.id,
      label: formatManagedEntryLabel(entry.displayName, entry.currentState, {
        available: entry.available,
      }),
      description: entry.summary,
      category: entry.category,
      shortcut: entry.available ? "space" : undefined,
      onSelect: () => undefined,
    });
  }

  if (section.saveAction && section.pendingCount > 0) {
    items.push({
      id: `save:${section.title}`,
      label: section.saveLabel ?? `Save changes (${section.pendingCount})`,
      description: section.saveDescription ?? "Persist staged changes",
      category: "save",
      shortcut: "s",
      onSelect: (ctx) => ctx.finish(section.saveAction as ManagerAction),
    });
  }

  return items;
}

export function createManagedEntriesView(section: ManagedEntrySection): PaletteView {
  const items = buildManagedEntryItems(section);

  return {
    title: section.title,
    items,
    footerHint: section.footerHint,
    onResume: () => createManagedEntriesView(section),
    handleKey: (data, ctx, selectedItem) => {
      if ((data === "s" || data === "S") && section.saveAction && section.pendingCount > 0) {
        ctx.finish(section.saveAction);
        return true;
      }

      if (
        data === " " &&
        selectedItem &&
        !selectedItem.id.startsWith("save:") &&
        !selectedItem.id.startsWith("empty:")
      ) {
        const selectedEntry = section.entries.find((entry) => entry.id === selectedItem.id);
        if (!selectedEntry || !selectedEntry.available) return true;

        section.toggle(selectedEntry.id);
        ctx.run(async () => {
          ctx.replace(await section.refreshView(), { preserveState: true });
        });
        return true;
      }

      return false;
    },
  };
}
