export const EXPLORATION_TOOL_NAME_LIST = [
  "read",
  "grep",
  "find",
  "ls",
  "read_file",
  "grep_files",
  "find_files",
  "list_dir",
] as const;

export type ExplorationToolName = (typeof EXPLORATION_TOOL_NAME_LIST)[number];

export type ExplorationItem = {
  toolName: ExplorationToolName;
  detail: string;
  failed?: boolean;
  errorPreview?: string[];
};

export type ExplorationGroup = {
  items: ExplorationItem[];
};

export type ExplorationSummaryItem = Pick<ExplorationItem, "detail" | "failed" | "errorPreview">;

export type SetStatusSegmentPayload = {
  key: string;
  text: string;
  align?: "left" | "center" | "right";
  priority?: number;
};

export type RemoveStatusSegmentPayload = {
  key: string;
};

export const LIVE_EXPLORATION_SEGMENT_KEY = "codex-content:exploration";
export const EXPLORATION_WIDGET_KEY = "codex-content:exploration-widget";
export const EXPLORATION_TOOL_NAMES = new Set<string>(EXPLORATION_TOOL_NAME_LIST);
