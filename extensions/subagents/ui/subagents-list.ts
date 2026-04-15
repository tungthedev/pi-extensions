import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import type { LayeredRoleRecord } from "../subagents/roles-types.ts";

export type SubagentsListState = {
  cursor: number;
  scrollOffset: number;
  query: string;
};

export type SubagentsListEntry =
  | { kind: "create" }
  | { kind: "section"; label: "Builtin" | "Custom" }
  | { kind: "spacer" }
  | { kind: "role"; roleKey: string; role: LayeredRoleRecord };

export type SubagentsListAction =
  | { type: "create" }
  | { type: "open-detail"; roleKey: string }
  | { type: "close" };

const VIEWPORT_HEIGHT = 12;

export function buildRoleKey(role: Pick<LayeredRoleRecord, "source" | "filePath" | "name">): string {
  return `${role.source}:${role.filePath ?? role.name}`;
}

function roleSortWeight(role: LayeredRoleRecord): number {
  if (role.effectiveSource === role.source) return 0;
  return role.source === "project" ? 1 : role.source === "user" ? 2 : 3;
}

export function buildListEntries(roles: LayeredRoleRecord[]): SubagentsListEntry[] {
  const sortedRoles = [...roles].sort((left, right) => {
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) return nameCompare;
    return roleSortWeight(left) - roleSortWeight(right);
  });

  const builtinRoles = sortedRoles.filter((role) => role.source === "builtin");
  const customRoles = sortedRoles.filter((role) => role.source !== "builtin");

  const entries: SubagentsListEntry[] = [{ kind: "create" }];
  if (builtinRoles.length > 0) {
    entries.push({ kind: "section", label: "Builtin" });
    entries.push(...builtinRoles.map((role) => ({ kind: "role" as const, roleKey: buildRoleKey(role), role })));
  }
  if (customRoles.length > 0) {
    if (builtinRoles.length > 0) entries.push({ kind: "spacer" });
    entries.push({ kind: "section", label: "Custom" });
    entries.push(...customRoles.map((role) => ({ kind: "role" as const, roleKey: buildRoleKey(role), role })));
  }
  return entries;
}

function filterEntries(entries: SubagentsListEntry[], query: string): SubagentsListEntry[] {
  if (!query.trim()) return entries;
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (entry.kind === "create") return "create new subagent".includes(needle);
    if (entry.kind !== "role") return false;
    return [entry.role.name, entry.role.description, entry.role.source]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function clampState(state: SubagentsListState, filtered: SubagentsListEntry[]): void {
  if (filtered.length === 0) {
    state.cursor = 0;
    state.scrollOffset = 0;
    return;
  }
  state.cursor = Math.max(0, Math.min(state.cursor, filtered.length - 1));
  const maxOffset = Math.max(0, filtered.length - VIEWPORT_HEIGHT);
  state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));
  if (state.cursor < state.scrollOffset) state.scrollOffset = state.cursor;
  if (state.cursor >= state.scrollOffset + VIEWPORT_HEIGHT) {
    state.scrollOffset = state.cursor - VIEWPORT_HEIGHT + 1;
  }
}

export function handleListInput(
  state: SubagentsListState,
  entries: SubagentsListEntry[],
  data: string,
): SubagentsListAction | undefined {
  const filtered = filterEntries(entries, state.query);
  clampState(state, filtered);

  if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
    if (state.query.length > 0) {
      state.query = "";
      state.cursor = 0;
      state.scrollOffset = 0;
      return;
    }
    return { type: "close" };
  }

  if (matchesKey(data, "backspace")) {
    if (state.query.length > 0) state.query = state.query.slice(0, -1);
    state.cursor = 0;
    state.scrollOffset = 0;
    return;
  }

  if (matchesKey(data, "up")) {
    state.cursor -= 1;
    clampState(state, filtered);
    return;
  }
  if (matchesKey(data, "down")) {
    state.cursor += 1;
    clampState(state, filtered);
    return;
  }

  if (matchesKey(data, "return") || data === "return") {
    const entry = filtered[state.cursor];
    if (!entry) return;
    if (entry.kind === "create") return { type: "create" };
    if (entry.kind !== "role") return;
    if (entry.role.source === "builtin" && entry.role.name === "default") return;
    return { type: "open-detail", roleKey: entry.roleKey };
  }

  if (data.length === 1 && data.charCodeAt(0) >= 32) {
    state.query += data;
    state.cursor = 0;
    state.scrollOffset = 0;
  }

  return;
}

function padToWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  const padding = Math.max(0, width - visibleWidth(truncated));
  return `${truncated}${" ".repeat(padding)}`;
}

function activeCursor(theme: Theme): string {
  return theme.fg("muted", "→ ");
}

export function renderList(
  state: SubagentsListState,
  entries: SubagentsListEntry[],
  width: number,
  theme: Theme,
  warnings: string[] = [],
): string[] {
  const filtered = filterEntries(entries, state.query);
  clampState(state, filtered);
  const lines: string[] = [];
  const innerWidth = Math.max(20, width - 2);
  lines.push(theme.fg("accent", `Subagents ${"─".repeat(Math.max(0, innerWidth - 10))}`));
  lines.push(`Search: ${state.query || ""}`);
  lines.push("");

  const visible = filtered.slice(state.scrollOffset, state.scrollOffset + VIEWPORT_HEIGHT);
  for (const [index, entry] of visible.entries()) {
    const actualIndex = state.scrollOffset + index;
    const selected = actualIndex === state.cursor;
    if (entry.kind === "create") {
      const label = selected ? `${activeCursor(theme)}${theme.fg("accent", "Create new subagent")}` : "  Create new subagent";
      lines.push(truncateToWidth(label, innerWidth));
      lines.push("");
      continue;
    }
    if (entry.kind === "section") {
      lines.push(theme.fg("muted", entry.label));
      continue;
    }
    if (entry.kind === "spacer") {
      lines.push("");
      continue;
    }
    const source = entry.role.source === "project" ? "[proj]" : entry.role.source === "user" ? "[user]" : "";
    const locked = entry.role.source === "builtin" && entry.role.name === "default" ? " 🔒" : "";
    const labelWidth = Math.min(25, Math.max(0, innerWidth - 2));
    const sourcePart = source ? ` ${source}` : "";
    const label = entry.role.source === "builtin" && entry.role.name === "default"
      ? theme.fg("muted", `${entry.role.name}${sourcePart}${locked}`)
      : selected
        ? `${theme.fg("accent", entry.role.name)}${sourcePart}${entry.role.overridesBuiltin ? " override" : ""}${locked}`
        : `${entry.role.name}${sourcePart}${entry.role.overridesBuiltin ? " override" : ""}${locked}`;
    const prefix = `${selected ? activeCursor(theme) : "  "}${padToWidth(label, labelWidth)}`;
    const remainingWidth = Math.max(0, innerWidth - visibleWidth(prefix));
    const description = remainingWidth > 1 ? truncateToWidth(entry.role.description, remainingWidth - 1) : "";
    lines.push(description ? `${prefix} ${description}` : prefix);
  }
  while (lines.length < VIEWPORT_HEIGHT + 3) lines.push("");

  if (warnings.length > 0) {
    lines.push(theme.fg("warning", warnings[0]!));
  } else {
    lines.push(theme.fg("muted", "[↑↓] move  [enter] select  [esc] close"));
  }

  return lines;
}
