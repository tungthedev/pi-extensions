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
    tools: [optional("read_file")],
  },
  shell: {
    extension: "shell",
    tools: [optional("shell")],
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
      optional("Read"),
      optional("LS"),
      optional("Grep"),
      optional("Glob"),
      optional("Create"),
      optional("Edit"),
      optional("ApplyPatch"),
      optional("AskUser"),
      optional("TodoWrite"),
      optional("Execute"),
      optional("Skill"),
    ],
  },
  forgeContent: {
    extension: "forge-content",
    tools: [
      optional("fs_search"),
      optional("patch"),
      optional("followup"),
      optional("todos_write"),
      optional("todos_read"),
    ],
  },
  subagentsCodex: {
    extension: "subagents-codex",
    tools: [
      optional("spawn_agent"),
      optional("send_input"),
      optional("wait_agent"),
      optional("close_agent"),
    ],
  },
  subagentsTask: {
    extension: "subagents-task",
    tools: [optional("Task"), optional("TaskOutput"), optional("TaskStop")],
  },
} satisfies Record<string, ToolsetContribution>;

export const TOOLSET_MODE_ORDER = {
  pi: ["piBuiltins", "web", "subagentsTask"],
  codex: ["shell", "read", "web", "codexContent", "subagentsCodex"],
  forge: ["piBuiltins", "shell", "read", "web", "forgeContent", "subagentsTask"],
  droid: ["droidContent", "web", "subagentsTask"],
} satisfies Record<ToolsetModeId, readonly (keyof typeof TOOLSET_CONTRIBUTIONS)[]>;

export const TOOLSET_CONFLICT_RULES = [
  {
    owner: "codex-content",
    when: ["codex"],
    hides: ["read", "grep", "find", "ls", "edit", "write", "bash"],
  },
  {
    owner: "droid-content",
    when: ["droid"],
    hides: ["read", "grep", "find", "ls", "edit", "write", "bash", "shell", "read_file"],
  },
  {
    owner: "forge-content",
    when: ["forge"],
    hides: ["read", "grep", "find", "ls", "edit", "bash"],
  },
  {
    owner: "shell",
    when: ["pi"],
    hides: ["shell"],
  },
  {
    owner: "subagents-codex",
    when: ["codex"],
    hides: ["Task", "TaskOutput", "TaskStop"],
  },
  {
    owner: "subagents-task",
    when: ["pi", "forge", "droid"],
    hides: ["spawn_agent", "send_input", "wait_agent", "close_agent"],
  },
  {
    owner: "mode-conflicts",
    when: ["pi", "codex", "forge"],
    hides: [
      "Read",
      "LS",
      "Grep",
      "Glob",
      "Create",
      "Edit",
      "ApplyPatch",
      "AskUser",
      "TodoWrite",
      "Execute",
      "Skill",
    ],
  },
  {
    owner: "mode-conflicts",
    when: ["pi", "droid", "forge"],
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
  {
    owner: "mode-conflicts",
    when: ["pi", "codex", "droid"],
    hides: ["fs_search", "patch", "followup", "todos_write", "todos_read"],
  },
] satisfies readonly ToolsetConflictRule[];
