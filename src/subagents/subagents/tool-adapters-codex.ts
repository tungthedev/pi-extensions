import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";
import { Container, Text } from "@mariozechner/pi-tui";

import type { PublicAgentSnapshot } from "./types.ts";

import {
  expandHintLine,
  renderEmptySlot,
  renderFallbackResult,
  renderLines,
  titleLine,
  toolCallLine,
} from "../../shared/renderers/common.ts";
import { validateSubagentName } from "./naming.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";
import {
  buildSpawnAgentTypeDescription,
  resolveAgentProfiles,
} from "./profiles.ts";
import { resolveRequestedAgentType } from "./profiles-apply.ts";
import {
  buildSendMessageContent,
  toPublicAgentSnapshot,
} from "./results.ts";
import { validateAgentTarget } from "./task-paths.ts";
import {
  extractSnapshotDetails,
  normalizeTaskOutput,
  previewTaskText,
  renderWaitAgentResult,
} from "./renderers.ts";

type SchemaWithDescription = { description?: string };

export type CodexToolAdapterDeps = {
  lifecycle: ReturnType<typeof createSubagentLifecycleService>;
  renderSpawnPromptPreview: (prompt: string, theme: ExtensionContext["ui"]["theme"]) => Text;
  normalizeWaitAgentTimeoutMs: (timeoutMs: number | undefined) => number;
};

export type CodexToolAdapterHandle = {
  refreshRoleDescriptions: (cwd?: string) => void;
};

function resolvePreferredAgentOutput(agent: PublicAgentSnapshot): string | undefined {
  if (agent.status === "running") {
    return agent.update_message ?? agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
  }
  return agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
}

function renderForegroundSpawnResult(
  agent: PublicAgentSnapshot,
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
): Text | Container {
  const output = normalizeTaskOutput(resolvePreferredAgentOutput(agent));
  if (!output) {
    return renderEmptySlot();
  }

  if (expanded) {
    return renderLines(output.split("\n").map((line) => theme.fg("toolOutput", line)));
  }

  const preview = previewTaskText(output, 3);
  const lines = preview.visibleLines.map((line) => theme.fg("toolOutput", line));

  if (preview.hiddenLineCount > 0) {
    lines.push(
      theme.fg(
        "muted",
        `... (+${preview.hiddenLineCount} more ${preview.hiddenLineCount === 1 ? "line" : "lines"}, ctrl+o to expand)`,
      ),
    );
  }

  return renderLines(lines);
}

function buildSpawnAgentToolDescription(agentRoleGuidance: string): string {
  const toolDescription = [
    agentRoleGuidance,
    "Spawns an agent to work on the specified task. If your current task is `/root/task1` and you spawn_agent with task_name \"task_3\" the agent will have canonical task name `/root/task1/task_3`.",
    "You are then able to refer to this agent as `task_3` or `/root/task1/task_3` interchangeably. However an agent `/root/task2/task_3` would only be able to communicate with this agent via its canonical name `/root/task1/task_3`.",
    "The spawned agent will have the same tools as you and the ability to spawn its own subagents.",
    "Spawned agents inherit your current model by default. Omit `model` to use that preferred default; set `model` only when an explicit override is needed.",
    "It will be able to send you and other running agents messages, and its final answer will be provided to you when it finishes.",
    "The new agent's canonical task name will be provided to it along with the message.",
  ].join("\n");

  const agentRoleUsageHint = agentRoleGuidance
    ? "Agent-role guidance below only helps choose which agent to use after spawning is already authorized; it never authorizes spawning by itself."
    : "";

  return [
    toolDescription,
    "This spawn_agent tool provides you access to sub-agents that inherit your current model by default. Do not set the `model` field unless the user explicitly asks for a different model or there is a clear task-specific reason. You should follow the rules and guidelines below to use this tool.",
    "",
    "Only use `spawn_agent` if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.",
    "Requests for depth, thoroughness, research, investigation, or detailed codebase analysis do not count as permission to spawn.",
    agentRoleUsageHint,
    "",
    "### When to delegate vs. do the subtask yourself",
    "- First, quickly analyze the overall user task and form a succinct high-level plan. Identify which tasks are immediate blockers on the critical path, and which tasks are sidecar tasks that are needed but can run in parallel without blocking the next local step. As part of that plan, explicitly decide what immediate task you should do locally right now. Do this planning step before delegating to agents so you do not hand off the immediate blocking task to a submodel and then waste time waiting on it.",
    "- Use a subagent when a subtask is easy enough for it to handle and can run in parallel with your local work. Prefer delegating concrete, bounded sidecar tasks that materially advance the main task without blocking your immediate next local step.",
    "- Do not delegate urgent blocking work when your immediate next step depends on that result. If the very next action is blocked on that task, the main rollout should usually do it locally to keep the critical path moving.",
    "- Keep work local when the subtask is too difficult to delegate well and when it is tightly coupled, urgent, or likely to block your immediate next step.",
    "",
    "### Designing delegated subtasks",
    "- Subtasks must be concrete, well-defined, and self-contained.",
    "- Delegated subtasks must materially advance the main task.",
    "- Do not duplicate work between the main rollout and delegated subtasks.",
    "- Avoid issuing multiple delegate calls on the same unresolved thread unless the new delegated task is genuinely different and necessary.",
    "- Narrow the delegated ask to the concrete output you need next.",
    "- For coding tasks, prefer delegating concrete code-change worker subtasks over read-only explorer analysis when the subagent can make a bounded patch in a clear write scope.",
    "- When delegating coding work, instruct the submodel to edit files directly in its forked workspace and list the file paths it changed in the final answer.",
    "- For code-edit subtasks, decompose work so each delegated task has a disjoint write set.",
    "### After you delegate",
    "- Call wait_agent very sparingly. Only call wait_agent when you need the result immediately for the next critical-path step and you are blocked until it returns.",
    "- Do not redo delegated subagent tasks yourself; focus on integrating results or tackling non-overlapping work.",
    "- While the subagent is running in the background, do meaningful non-overlapping work immediately.",
    "- Do not repeatedly wait by reflex.",
    "- When a delegated coding task returns, quickly review the uploaded changes, then integrate or refine them.",
    "",
    "### Parallel delegation patterns",
    "- Run multiple independent information-seeking subtasks in parallel when you have distinct questions that can be answered independently.",
    "- Split implementation into disjoint codebase slices and spawn multiple agents for them in parallel when the write scopes do not overlap.",
    "- Delegate verification only when it can run in parallel with ongoing implementation and is likely to catch a concrete risk before final integration.",
    "- The key is to find opportunities to spawn multiple independent subtasks in parallel within the same round, while ensuring each subtask is well-defined, self-contained, and materially advances the main task.",
  ].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n");
}

function shouldForkCodexTurns(forkTurns: unknown): boolean {
  if (forkTurns === undefined || forkTurns === null || forkTurns === "" || forkTurns === "all") {
    return true;
  }
  if (forkTurns === "none") return false;
  if (typeof forkTurns === "string" && /^[1-9][0-9]*$/.test(forkTurns)) return true;
  throw new Error("fork_turns must be `none`, `all`, or a positive integer string");
}

function buildCodexSpawnAgentContent(taskName: string): string {
  return JSON.stringify({ task_name: taskName });
}

function buildCodexWaitAgentContent(agents: PublicAgentSnapshot[], timedOut: boolean): string {
  if (timedOut || agents.length === 0) {
    return JSON.stringify({ message: "No agent updates before timeout", timed_out: true });
  }
  const names = agents.map((agent) => agent.name).join(", ");
  return JSON.stringify({
    message: `${names} ${agents.length === 1 ? "has" : "have"} updates`,
    timed_out: false,
  });
}

function buildCodexListAgentsContent(agents: PublicAgentSnapshot[]): string {
  return JSON.stringify({
    agents: agents.map((agent) => ({
      agent_name: agent.name,
      agent_status: agent.status,
      task_path: agent.task_path,
      last_task_message: resolvePreferredAgentOutput(agent),
    })),
  });
}

export function registerCodexToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: CodexToolAdapterDeps,
): CodexToolAdapterHandle {
  type RegisteredTool = Parameters<typeof pi.registerTool>[0];
  const spawnAgentParameters = Type.Object({
    task_name: Type.String({
      description:
        "Task name for the new agent. Use lowercase letters, digits, underscores and hyphens.",
    }),
    message: Type.String({
      description: "Initial plain-text task for the new agent.",
    }),
    agent_type: Type.Optional(
      Type.String({
        description: "",
      }),
    ),
    fork_context: Type.Optional(
      Type.Boolean({
        description:
          "Compatibility option. When true, fork the current thread history into the new agent before sending the initial prompt. Prefer `fork_turns` for Codex-style launches.",
      }),
    ),
    fork_turns: Type.Optional(
      Type.String({
        description:
          "Optional number of turns to fork. Defaults to `all`. Use `none` or `all`; positive integer strings such as `3` are accepted for Codex compatibility but currently fork all available context.",
      }),
    ),
    model: Type.Optional(
      Type.String({
        description:
          "Optional model override for the new agent. Leave unset to inherit the same model as the parent, which is the preferred default. Only set this when the user explicitly asks for a different model or the task clearly requires one.",
      }),
    ),
    reasoning_effort: Type.Optional(
      Type.String({
        description: "Optional reasoning effort override for the new agent. Replaces the inherited reasoning effort.",
      }),
    ),
    interactive: Type.Optional(
      Type.Boolean({
        description:
          "If true, launch the child in a visible multiplexer pane/tab for direct user interaction. Default false. Only use when the user explicitly asks to work in the child session.",
      }),
    ),
  });

  const spawnAgentTool: RegisteredTool = {
    name: "spawn_agent",
    label: "spawn_agent",
    description: "",
    parameters: spawnAgentParameters,
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
      const prompt = params.message?.trim();
      if (!prompt) {
        throw new Error("message is required");
      }

      const result = await deps.lifecycle.spawn({
        mode: "codex",
        ctx,
        name: validateSubagentName(params.task_name, "task_name"),
        prompt,
        requestedAgentType: params.agent_type,
        requestedModel: params.model,
        requestedReasoningEffort: params.reasoning_effort,
        runInBackground: true,
        interactive: params.interactive,
        forkContext: params.fork_context ?? shouldForkCodexTurns(params.fork_turns),
      });

      return {
        content: [
          {
            type: "text",
            text: buildCodexSpawnAgentContent(result.name),
          },
        ],
        details: {
          task_name: result.name,
          prompt,
        },
      };
    },
    renderCall(args: any, theme: any) {
      const publicName =
        typeof args.task_name === "string" && args.task_name.trim().length > 0 ? args.task_name.trim() : "agent";
      const agentType = resolveRequestedAgentType(args.agent_type);
      const roleLabel = agentType !== "default" ? ` [${agentType}]` : "";
      const transportLabel = args.interactive ? theme.fg("muted", " (interactive)") : "";
      const backgroundLabel = theme.fg("muted", " (background)");
      const agentName = `${theme.fg("accent", `${publicName}${roleLabel}`)}${transportLabel}`;
      const callLine = new Text(
        toolCallLine(theme, "Spawn", `${agentName}${backgroundLabel}`),
        0,
        0,
      );

      const prompt = typeof args.message === "string" ? args.message.trim() : "";
      if (!prompt) {
        return callLine;
      }

      const container = new Container();
      container.addChild(callLine);
      container.addChild(deps.renderSpawnPromptPreview(prompt, theme));
      return container;
    },
    renderResult(result: any, options: any, theme: any) {
      const details =
        (result.details as
          | ({
              agents?: PublicAgentSnapshot[];
              timed_out?: boolean;
              prompt?: string;
              name?: string;
              wait_for_agent?: boolean;
            } & Partial<PublicAgentSnapshot>)
          | undefined) ?? undefined;
      if (!details?.wait_for_agent) {
        return renderEmptySlot();
      }
      if (details?.agents?.[0]) {
        return renderForegroundSpawnResult(details.agents[0], Boolean(options.expanded), theme);
      }
      if (details?.prompt) {
        return renderEmptySlot();
      }
      return renderFallbackResult(result, theme.fg("muted", "spawned"));
    },
  };

  const refreshRoleDescriptions = (cwd = process.cwd()) => {
    const agentTypeDescription = buildSpawnAgentTypeDescription(resolveAgentProfiles({ cwd }));
    spawnAgentTool.description = buildSpawnAgentToolDescription(agentTypeDescription);
    ((spawnAgentParameters).properties.agent_type as SchemaWithDescription).description =
      agentTypeDescription;
  };

  refreshRoleDescriptions();
  pi.registerTool(spawnAgentTool);

  pi.registerTool({
    name: "send_message",
    label: "send_message",
    description:
      "Send a message to an existing agent. The message will be delivered promptly. By default, uses follow-up mode; set steer=true to redirect an active agent mid-turn or to start a new turn for an inactive agent.",
    parameters: Type.Object({
      target: Type.String({ description: "Relative or canonical task name to message (from spawn_agent)." }),
      message: Type.String({
        description: "Message text to send to the target agent.",
      }),
      steer: Type.Optional(
        Type.Boolean({
          description:
            "When true, steer active agents mid-turn; inactive agents start a new turn. Defaults to false follow-up mode.",
        }),
      ),
    }),
    async execute(_toolCallId: any, params: any) {
      const target = validateAgentTarget(params.target, "target");
      const input = params.message?.trim();
      if (!input) {
        throw new Error("message is required");
      }

      const result = await deps.lifecycle.resumeByName({
        mode: "codex",
        name: target,
        input,
        steer: params.steer,
      });

      return {
        content: [{ type: "text", text: buildSendMessageContent(result.submissionId) }],
        details: {
          submission_id: result.submissionId,
          ...toPublicAgentSnapshot(result.snapshot),
          input,
          command: result.commandType,
        },
      };
    },
    renderCall(args: any, theme: any) {
      const target =
        typeof args.target === "string" && args.target.trim().length > 0
          ? args.target.trim()
          : "agent";
      return new Text(toolCallLine(theme, "Send message", theme.fg("accent", target)), 0, 0);
    },
    renderResult(result: any, options: any, theme: any) {
      const details = (result.details ?? {}) as PublicAgentSnapshot & { input: string };
      if (typeof details.input !== "string") {
        return renderFallbackResult(result, theme.fg("muted", "messaged subagent"));
      }

      const preview = previewTaskText(
        details.input,
        options.expanded ? Number.MAX_SAFE_INTEGER : 5,
      );
      const lines = preview.visibleLines.map((line) => theme.fg("toolOutput", line));

      if (!options.expanded && preview.hiddenLineCount > 0) {
        lines.push(expandHintLine(theme, preview.hiddenLineCount, "line"));
      }

      return renderLines(lines);
    },
  });

  pi.registerTool({
    name: "list_agents",
    label: "list_agents",
    description: "List live agents in the current root thread tree. Optionally filter by task-path prefix.",
    parameters: Type.Object({
      path_prefix: Type.Optional(
        Type.String({ description: "Optional task-path prefix (not ending with trailing slash). Accepts the same relative or absolute task-path syntax." }),
      ),
    }),
    async execute(_toolCallId: any, params: any) {
      const result = deps.lifecycle.listAgents({
        pathPrefix: params.path_prefix,
      });
      const agents = result.snapshots.map(toPublicAgentSnapshot);
      return {
        content: [{ type: "text", text: buildCodexListAgentsContent(agents) }],
        details: {
          agents,
          path_prefix: params.path_prefix,
        },
      };
    },
    renderCall(args: any, theme: any) {
      const prefix = typeof args.path_prefix === "string" && args.path_prefix.trim().length > 0
        ? args.path_prefix.trim()
        : "agents";
      return new Text(toolCallLine(theme, "List", theme.fg("accent", prefix)), 0, 0);
    },
    renderResult(result: any, _options: any, theme: any) {
      const details = result.details as { agents?: PublicAgentSnapshot[] } | undefined;
      const agents = details?.agents ?? [];
      if (agents.length === 0) {
        return new Text(theme.fg("muted", "No agents"), 0, 0);
      }
      return renderLines(
        agents.map((agent) => {
          const path = agent.task_path ? theme.fg("muted", ` ${agent.task_path}`) : "";
          return `${theme.fg("accent", agent.name)}${path}${theme.fg("muted", ": ")}${agent.status}`;
        }),
      );
    },
  });

  pi.registerTool({
    name: "wait_agent",
    label: "wait_agent",
    description:
      "Wait for a mailbox update from any live agent, including queued messages and final-status notifications. Does not return the content; returns either a summary of which agents have updates (if any), or a timeout summary if no mailbox update arrives before the deadline.",
    parameters: Type.Object({
      timeout_ms: Type.Optional(
        Type.Number({
          description:
            "Optional timeout in milliseconds. Defaults to 45000, min 30000, max 90000.",
        }),
      ),
    }),
    async execute(_toolCallId: any, params: any) {
      const result = await deps.lifecycle.waitAny({
        timeoutMs: deps.normalizeWaitAgentTimeoutMs(params.timeout_ms),
      });
      const snapshots = result.snapshots.map(toPublicAgentSnapshot);
      return {
        content: [{ type: "text", text: buildCodexWaitAgentContent(snapshots, result.timedOut) }],
        details: {
          agents: snapshots,
          status: Object.fromEntries(snapshots.map((snapshot) => [snapshot.name, snapshot.status])),
          timed_out: result.timedOut,
        },
      };
    },
    renderCall(_args, theme) {
      return new Text(toolCallLine(theme, "Wait", theme.fg("accent", "for agents")), 0, 0);
    },
    renderResult(result: any, options: any, theme: any) {
      const details =
        result.details as { agents?: PublicAgentSnapshot[]; timed_out?: boolean } | undefined;
      if (!details) {
        return renderFallbackResult(result, theme.fg("muted", buildCodexWaitAgentContent([], false)));
      }
      return renderWaitAgentResult(details, Boolean(options.expanded), theme);
    },
  });

  pi.registerTool({
    name: "close_agent",
    label: "close_agent",
    description: "Close an agent and any open descendants when they are no longer needed, and return the target agent's current status after shutdown was requested. Don't keep agents open for too long if they are not needed anymore.",
    parameters: Type.Object({
      target: Type.String({ description: "Relative or canonical task name to close (from spawn_agent)." }),
    }),
    async execute(_toolCallId: any, params: any) {
      const target = validateAgentTarget(params.target, "target");
      const result = await deps.lifecycle.stopByName(target);
      const snapshot = toPublicAgentSnapshot(result.snapshot);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ name: snapshot.name, status: snapshot.status }),
          },
        ],
        details: {
          status: snapshot,
          closed_descendant_count: result.closedDescendantCount ?? 0,
        },
      };
    },
    renderCall(args: any, theme: any) {
      const target =
        typeof args.target === "string" && args.target.trim().length > 0
          ? args.target.trim()
          : "agent";
      return new Text(toolCallLine(theme, "Close", theme.fg("accent", target)), 0, 0);
    },
    renderResult(result: any, _options: any, theme: any) {
      const details = result.details as { status?: PublicAgentSnapshot } | PublicAgentSnapshot | undefined;
      const snapshot = extractSnapshotDetails(details);
      if (!snapshot) {
        return renderFallbackResult(result, theme.fg("muted", "closed"));
      }
      const displayName = snapshot.name ?? "agent";
      return new Text(titleLine(theme, "text", "Closed", theme.fg("accent", displayName)), 0, 0);
    },
  });

  return { refreshRoleDescriptions };
}
