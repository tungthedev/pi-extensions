import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import type {
  InstalledPackage,
  LocalExtensionEntry,
  PackageExtensionEntry,
  State,
} from "../types.ts";

import { discoverLocalExtensions, setLocalExtensionState } from "../local.ts";
import {
  applyPackageExtensionStateChanges,
  discoverInstalledPackages,
  discoverPackageExtensions,
} from "../packages.ts";
import type { ManagedEntrySection } from "./entry-model.ts";
import { buildLocalManagedEntrySection } from "./sources/local-source.ts";
import { buildPackageManagedEntrySection } from "./sources/package-source.ts";

export class ExtensionManagerController {
  localEntries: LocalExtensionEntry[] = [];
  packages: InstalledPackage[] = [];
  packageEntries = new Map<string, PackageExtensionEntry[]>();
  stagedLocalStates = new Map<string, State>();
  stagedPackageStates = new Map<string, Map<string, State>>();

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly ctx: ExtensionCommandContext,
  ) {}

  async refresh(): Promise<void> {
    this.localEntries = await discoverLocalExtensions(this.ctx.cwd);
    this.packages = await discoverInstalledPackages(this.pi, this.ctx.cwd);
    this.packageEntries.clear();
  }

  localEntriesForScope(scope: "global" | "project"): LocalExtensionEntry[] {
    return this.localEntries.filter((entry) => entry.scope === scope);
  }

  localManagedEntries(scope: "global" | "project"): ManagedEntrySection {
    return buildLocalManagedEntrySection(scope, this);
  }

  currentLocalState(entry: LocalExtensionEntry): State {
    return this.stagedLocalStates.get(entry.id) ?? entry.state;
  }

  toggleLocal(entryId: string): void {
    const entry = this.localEntries.find((item) => item.id === entryId);
    if (!entry) return;

    const current = this.currentLocalState(entry);
    const next: State = current === "enabled" ? "disabled" : "enabled";
    if (next === entry.state) {
      this.stagedLocalStates.delete(entry.id);
    } else {
      this.stagedLocalStates.set(entry.id, next);
    }
  }

  pendingLocalCount(): number {
    return this.stagedLocalStates.size;
  }

  async ensurePackageEntries(packageId: string): Promise<PackageExtensionEntry[]> {
    const cached = this.packageEntries.get(packageId);
    if (cached) return cached;

    const pkg = this.packages.find((item) => item.id === packageId);
    if (!pkg) return [];

    const entries = await discoverPackageExtensions(pkg, this.ctx.cwd);
    this.packageEntries.set(packageId, entries);
    return entries;
  }

  currentPackageState(entry: PackageExtensionEntry): State {
    const staged = this.stagedPackageStates.get(entry.packageId)?.get(entry.extensionPath);
    return staged ?? entry.originalState;
  }

  togglePackageEntry(packageId: string, extensionPath: string): void {
    const entries = this.packageEntries.get(packageId) ?? [];
    const entry = entries.find((item) => item.extensionPath === extensionPath);
    if (!entry || !entry.available) return;

    const packageStage = this.stagedPackageStates.get(packageId) ?? new Map<string, State>();
    const current = packageStage.get(extensionPath) ?? entry.originalState;
    const next: State = current === "enabled" ? "disabled" : "enabled";

    if (next === entry.originalState) {
      packageStage.delete(extensionPath);
    } else {
      packageStage.set(extensionPath, next);
    }

    if (packageStage.size === 0) {
      this.stagedPackageStates.delete(packageId);
    } else {
      this.stagedPackageStates.set(packageId, packageStage);
    }
  }

  pendingPackageCount(packageId: string): number {
    return this.stagedPackageStates.get(packageId)?.size ?? 0;
  }

  async packageManagedEntries(packageId: string): Promise<ManagedEntrySection> {
    return buildPackageManagedEntrySection(packageId, this);
  }

  async applyLocalChanges(): Promise<{ changed: number; errors: string[] }> {
    let changed = 0;
    const errors: string[] = [];

    for (const entry of this.localEntries) {
      const target = this.stagedLocalStates.get(entry.id);
      if (!target || target === entry.state) continue;

      const result = await setLocalExtensionState(entry, target);
      if (result.ok) {
        changed += 1;
      } else {
        errors.push(`${entry.displayName}: ${result.error}`);
      }
    }

    this.stagedLocalStates.clear();
    return { changed, errors };
  }

  async savePackageChanges(packageId: string): Promise<{ changed: number; errors: string[] }> {
    const pkg = this.packages.find((item) => item.id === packageId);
    const entries = this.packageEntries.get(packageId) ?? [];
    const staged = this.stagedPackageStates.get(packageId);
    if (!pkg || !staged || staged.size === 0) {
      return { changed: 0, errors: [] };
    }

    const changes = entries
      .filter((entry) => staged.has(entry.extensionPath) && entry.available)
      .map((entry) => ({
        extensionPath: entry.extensionPath,
        target: staged.get(entry.extensionPath) ?? entry.originalState,
      }));

    const missingErrors = entries
      .filter((entry) => staged.has(entry.extensionPath) && !entry.available)
      .map((entry) => `${entry.extensionPath}: missing on disk`);

    if (changes.length === 0) {
      this.stagedPackageStates.delete(packageId);
      return { changed: 0, errors: missingErrors };
    }

    const result = await applyPackageExtensionStateChanges(
      pkg.source,
      pkg.scope,
      changes,
      this.ctx.cwd,
    );
    if (!result.ok) {
      return { changed: 0, errors: [...missingErrors, result.error] };
    }

    this.stagedPackageStates.delete(packageId);
    return { changed: changes.length, errors: missingErrors };
  }
}
