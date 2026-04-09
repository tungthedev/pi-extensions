import type { ContextUsage, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { formatToolSetLabel } from "../settings/config.ts";
import { resolveSessionToolSet } from "../settings/session.ts";
import {
  EDITOR_BASE_LEFT_SEGMENT_KEY,
  EDITOR_BASE_RIGHT_SEGMENT_KEY,
} from "./types.ts";
import type { InlineSegment, WidgetRowRegistry } from "./widget-row.ts";
import { formatLeftStatus, formatRightStatus } from "./status-format.ts";

export type EditorStatusState = {
  cwd: string;
  gitBranch?: string;
  modelId?: string;
  thinkingLevel?: string;
  toolSetLabel?: string;
  usage?: ContextUsage;
};

export function baseSegments(
  state: EditorStatusState,
): Array<{ key: string; segment: InlineSegment }> {
  return [
    {
      key: EDITOR_BASE_LEFT_SEGMENT_KEY,
      segment: {
        align: "left",
        priority: 0,
        renderInline: () => formatLeftStatus(state),
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
): void {
  if (!statusRow) return;

  for (const { key, segment } of baseSegments(state)) {
    statusRow.set(key, segment);
  }

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
  state.usage = ctx.getContextUsage();
}

export async function syncStateFromSettings(
  state: EditorStatusState,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  state.toolSetLabel = formatToolSetLabel(await resolveSessionToolSet(ctx.sessionManager));
}
