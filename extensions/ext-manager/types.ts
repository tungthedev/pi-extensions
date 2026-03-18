export type Scope = "global" | "project";
export type State = "enabled" | "disabled";

export interface LocalExtensionEntry {
  id: string;
  scope: Scope;
  state: State;
  activePath: string;
  disabledPath: string;
  displayName: string;
  summary: string;
}

export interface InstalledPackage {
  id: string;
  scope: Scope;
  source: string;
  name: string;
  resolvedPath: string;
}

export interface PackageExtensionEntry {
  id: string;
  packageId: string;
  packageSource: string;
  scope: Scope;
  extensionPath: string;
  absolutePath: string;
  displayName: string;
  summary: string;
  available: boolean;
  originalState: State;
}

export interface ManagerAction {
  type: "apply-local" | "save-package" | "refresh" | "reload";
  packageId?: string;
}

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  category?: string;
  shortcut?: string;
  onSelect: (ctx: PaletteActionContext) => void | Promise<void>;
}

export interface PaletteView {
  title: string;
  items: PaletteItem[];
  searchable?: boolean;
  footerHint?: string;
  onResume?: () => PaletteView;
  handleKey?: (
    data: string,
    ctx: PaletteActionContext,
    selectedItem?: PaletteItem,
  ) => boolean | void;
}

export interface PaletteActionContext {
  push: (view: PaletteView) => void;
  replace: (view: PaletteView, options?: { preserveState?: boolean }) => void;
  close: () => void;
  finish: (action: ManagerAction) => void;
  run: (action: () => void | Promise<void>) => void;
}
