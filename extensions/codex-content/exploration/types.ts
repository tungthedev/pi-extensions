export type ExplorationItem = {
  toolName:
    | "read"
    | "grep"
    | "find"
    | "ls"
    | "read_file"
    | "grep_files"
    | "find_files"
    | "list_dir";
  detail: string;
  failed?: boolean;
  errorPreview?: string[];
};

export type ExplorationGroup = {
  items: ExplorationItem[];
};

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
export const EXPLORATION_TOOL_NAMES = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "read_file",
  "grep_files",
  "find_files",
  "list_dir",
]);
