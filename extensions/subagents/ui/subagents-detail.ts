import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";

import type { LayeredRoleRecord } from "../subagents/roles-types.ts";

export type SubagentsDetailState = {
  scrollOffset: number;
};

export type SubagentsDetailAction =
  | { type: "back" }
  | { type: "edit-main" }
  | { type: "edit-model" }
  | { type: "edit-shadowing-override"; focus?: "main" | "model" }
  | { type: "create-override"; focus?: "main" | "model" }
  | { type: "confirm-delete" };

const PROMPT_VIEWPORT = 12;

export function handleDetailInput(
  role: Pick<LayeredRoleRecord, "source" | "shadowedBy">,
  data: string,
): SubagentsDetailAction | undefined {
  if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) return { type: "back" };
  if (data === "e") {
    if (role.source === "builtin") {
      return role.shadowedBy ? { type: "edit-shadowing-override" } : { type: "create-override" };
    }
    return { type: "edit-main" };
  }
  if (data === "m") {
    if (role.source === "builtin") {
      return role.shadowedBy
        ? { type: "edit-shadowing-override", focus: "model" }
        : { type: "create-override", focus: "model" };
    }
    return { type: "edit-model" };
  }
  if (data === "d" && role.source !== "builtin") return { type: "confirm-delete" };
  return;
}

export function renderDetail(
  state: SubagentsDetailState,
  role: LayeredRoleRecord,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const source = role.source === "project" ? "project" : role.source === "user" ? "user" : "builtin";
  lines.push(theme.fg("accent", `${role.name} (${source})`));
  if (role.source === "builtin" && role.shadowedBy) {
    lines.push(theme.fg("warning", `Readonly base definition shadowed by ${role.shadowedBy}`));
  }
  lines.push(role.description || theme.fg("dim", "No description"));
  lines.push(`Model: ${role.model ?? "(default)"}`);
  lines.push(`Thinking: ${role.thinking ?? "off"}`);
  if (role.shadowedBy) lines.push(theme.fg("warning", `Shadowed by ${role.shadowedBy}`));
  lines.push("");
  lines.push(theme.fg("dim", "Prompt:"));

  const promptLines = role.prompt.split("\n");
  const maxOffset = Math.max(0, promptLines.length - PROMPT_VIEWPORT);
  state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));
  const visible = promptLines.slice(state.scrollOffset, state.scrollOffset + PROMPT_VIEWPORT);
  for (const line of visible) lines.push(line.slice(0, Math.max(20, width - 2)));
  while (visible.length + 6 > lines.length && lines.length < PROMPT_VIEWPORT + 6) lines.push("");

  const footer = role.source === "builtin"
    ? role.shadowedBy
      ? "[e] edit effective custom role  [m] edit effective custom model/thinking  [esc] back"
      : "[e] create custom override  [m] create custom override (model/thinking)  [esc] back"
    : "[e] edit description/prompt  [m] edit model/thinking  [d] delete  [esc] back";
  lines.push(theme.fg("dim", footer));
  return lines;
}
