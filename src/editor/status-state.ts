import type {
  ContextUsage,
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@mariozechner/pi-coding-agent";

import type { InlineSegment, WidgetRowRegistry } from "./widget-row.ts";

import { formatToolSetLabel } from "../settings/config.ts";
import { resolveSessionLoadSkills, resolveSessionToolSet } from "../settings/session.ts";
import { formatLeftStatus, formatRightStatus } from "./status-format.ts";
import { EDITOR_BASE_LEFT_SEGMENT_KEY, EDITOR_BASE_RIGHT_SEGMENT_KEY } from "./types.ts";

export type EditorStatusState = {
  cwd: string;
  gitBranch?: string;
  modelId?: string;
  thinkingLevel?: string;
  toolSetLabel?: string;
  loadSkillsEnabled?: boolean;
  skillCount?: number;
  usage?: ContextUsage;
};

function countLoadedSkills(pi: ExtensionAPI): number {
  const getCommands = (pi as { getCommands?: ExtensionAPI["getCommands"] }).getCommands;
  if (!getCommands) return 0;

  return getCommands
    .call(pi)
    .filter((command) => command.source === "skill" && command.name.startsWith("skill:")).length;
}

export function baseSegments(
  state: EditorStatusState,
  getTheme?: () => Theme,
): Array<{ key: string; segment: InlineSegment }> {
  return [
    {
      key: EDITOR_BASE_LEFT_SEGMENT_KEY,
      segment: {
        align: "left",
        priority: 0,
        renderInline: () => formatLeftStatus(state, getTheme?.()),
      },
    },
    {
      key: EDITOR_BASE_RIGHT_SEGMENT_KEY,
      segment: {
        align: "right",
        priority: 0,
        renderInline: (maxWidth) => formatRightStatus(state, maxWidth),
      },
    },
  ];
}

export function syncStatusRow(
  state: EditorStatusState,
  statusRow: WidgetRowRegistry | null,
  externalSegments: Map<string, InlineSegment>,
  getTheme?: () => Theme,
): void {
  if (!statusRow) return;

  void state;
  void getTheme;
  statusRow.clear();

  for (const [key, segment] of externalSegments) {
    statusRow.set(key, segment);
  }
}

export function syncStateFromContext(
  state: EditorStatusState,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
): void {
  state.cwd = ctx.cwd;
  state.modelId = ctx.model?.id;
  state.thinkingLevel = pi.getThinkingLevel();
  state.skillCount = countLoadedSkills(pi);
  state.usage = ctx.getContextUsage();
}

export async function syncStateFromSettings(
  state: EditorStatusState,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  state.toolSetLabel = formatToolSetLabel(await resolveSessionToolSet(ctx.sessionManager));
  state.loadSkillsEnabled = await resolveSessionLoadSkills(ctx.sessionManager);
}
