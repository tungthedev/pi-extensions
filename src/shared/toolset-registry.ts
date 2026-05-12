import type {
  ToolsetConflictRule,
  ToolsetContribution,
  ToolsetModeId,
  ToolsetToolDefinition,
} from "./toolset-types.js";

import { CODEX_CONTENT_TOOL_NAMES } from "../codex-content/metadata.js";
import { DROID_CONTENT_TOOL_NAMES } from "../droid-content/metadata.js";
import { GOAL_TOOL_NAMES } from "../goal/metadata.js";
import { SHELL_TOOL_NAMES } from "../shell/metadata.js";
import { SUBAGENT_CODEX_TOOL_NAMES } from "../subagents/metadata.js";

function optional(name: string): ToolsetToolDefinition {
  return { name, availability: "optional" };
}

function optionalTools(names: readonly string[]): ToolsetToolDefinition[] {
  return names.map((name) => optional(name));
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
    tools: optionalTools(SHELL_TOOL_NAMES),
  },
  skill: {
    extension: "skill",
    tools: [optional("skill")],
  },
  boomerang: {
    extension: "boomerang",
    tools: [optional("boomerang")],
  },
  goal: {
    extension: "goal",
    tools: optionalTools(GOAL_TOOL_NAMES),
  },
  codexContent: {
    extension: "codex-content",
    tools: optionalTools(CODEX_CONTENT_TOOL_NAMES),
  },
  droidContent: {
    extension: "droid-content",
    tools: optionalTools(DROID_CONTENT_TOOL_NAMES),
  },
  subagentsCodex: {
    extension: "subagents-codex",
    tools: optionalTools(SUBAGENT_CODEX_TOOL_NAMES),
  },
  subagentsTask: {
    extension: "subagents-task",
    tools: [optional("Task")],
  },
} satisfies Record<string, ToolsetContribution>;

export const TOOLSET_MODE_ORDER = {
  pi: ["piBuiltins", "web", "skill", "boomerang", "goal", "subagentsTask"],
  codex: ["shell", "read", "web", "skill", "boomerang", "goal", "codexContent", "subagentsCodex"],
  droid: ["read", "droidContent", "web", "skill", "boomerang", "goal", "subagentsTask"],
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
