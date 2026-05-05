import type {
  ToolsetConflictRule,
  ToolsetContribution,
  ToolsetModeId,
  ToolsetToolDefinition,
} from "./toolset-types.ts";

function optional(name: string): ToolsetToolDefinition {
  return { name, availability: "optional" };
}

export const TOOLSET_CONTRIBUTIONS = {
  piBuiltins: {
    extension: "pi-builtins",
    tools: [
      optional("read"),
      optional("grep"),
      optional("find"),
      optional("ls"),
      optional("edit"),
      optional("write"),
      optional("bash"),
    ],
  },
  web: {
    extension: "web",
    tools: [optional("WebSearch"), optional("WebSummary"), optional("FetchUrl")],
  },
  read: {
    extension: "read",
    tools: [optional("read")],
  },
  shell: {
    extension: "shell",
    tools: [optional("shell")],
  },
  skill: {
    extension: "skill",
    tools: [optional("skill")],
  },
  codexContent: {
    extension: "codex-content",
    tools: [
      optional("update_plan"),
      optional("read_plan"),
      optional("request_user_input"),
      optional("list_dir"),
      optional("find_files"),
      optional("grep_files"),
      optional("apply_patch"),
      optional("view_image"),
    ],
  },
  droidContent: {
    extension: "droid-content",
    tools: [
      optional("LS"),
      optional("Grep"),
      optional("Glob"),
      optional("Create"),
      optional("Edit"),
      optional("ApplyPatch"),
      optional("AskUser"),
      optional("TodoWrite"),
      optional("Execute"),
    ],
  },
  subagentsCodex: {
    extension: "subagents-codex",
    tools: [
      optional("spawn_agent"),
      optional("send_message"),
      optional("wait_agent"),
      optional("list_agents"),
      optional("close_agent"),
    ],
  },
  subagentsTask: {
    extension: "subagents-task",
    tools: [optional("Task")],
  },
} satisfies Record<string, ToolsetContribution>;

export const TOOLSET_MODE_ORDER = {
  pi: ["piBuiltins", "web", "skill", "subagentsTask"],
  codex: ["shell", "read", "web", "skill", "codexContent", "subagentsCodex"],
  droid: ["read", "droidContent", "web", "skill", "subagentsTask"],
} satisfies Record<ToolsetModeId, readonly (keyof typeof TOOLSET_CONTRIBUTIONS)[]>;

export const TOOLSET_CONFLICT_RULES = [
  {
    owner: "codex-content",
    when: ["codex"],
    hides: ["grep", "find", "ls", "edit", "write", "bash"],
  },
  {
    owner: "droid-content",
    when: ["droid"],
    hides: ["grep", "find", "ls", "edit", "write", "bash", "shell"],
  },
  {
    owner: "shell",
    when: ["pi"],
    hides: ["shell"],
  },
  {
    owner: "subagents-codex",
    when: ["codex"],
    hides: ["Task"],
  },
  {
    owner: "subagents-task",
    when: ["pi", "droid"],
    hides: ["spawn_agent", "send_message", "wait_agent", "list_agents", "close_agent"],
  },
  {
    owner: "mode-conflicts",
    when: ["pi", "codex"],
    hides: [
      "LS",
      "Grep",
      "Glob",
      "Create",
      "Edit",
      "ApplyPatch",
      "AskUser",
      "TodoWrite",
      "Execute",
    ],
  },
  {
    owner: "mode-conflicts",
    when: ["pi", "droid"],
    hides: [
      "update_plan",
      "read_plan",
      "request_user_input",
      "list_dir",
      "find_files",
      "grep_files",
      "apply_patch",
      "view_image",
    ],
  },
] satisfies readonly ToolsetConflictRule[];
