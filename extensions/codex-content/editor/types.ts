export type Align = "left" | "center" | "right";

export type SetStatusSegmentPayload = {
  key: string;
  text: string;
  align?: Align;
  priority?: number;
};

export type RemoveStatusSegmentPayload = {
  key: string;
};

export const EDITOR_STATUS_WIDGET_KEY = "codex-content:editor-status";
export const EDITOR_BASE_LEFT_SEGMENT_KEY = "codex-content:editor-base-left";
export const EDITOR_BASE_RIGHT_SEGMENT_KEY = "codex-content:editor-base-right";
