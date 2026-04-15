import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
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
import { buildWaitAgentContent } from "./notifications.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";
import {
  buildSpawnAgentTypeDescription,
  resolveAgentProfiles,
} from "./profiles.ts";
import { resolveRequestedAgentType } from "./profiles-apply.ts";
import {
  buildSendMessageContent,
  buildSpawnAgentContent,
  toPublicAgentSnapshot,
} from "./results.ts";
import { formatSubagentModelLabel } from "./rendering.ts";
import {
  extractSnapshotDetails,
  normalizeTaskOutput,
  previewTaskText,
  renderAgentCompletionResult,
} from "./renderers.ts";

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
    "Spawn a sub-agent for a well-scoped task. Returns the public child-agent name, plus completion details when available.",
  ].join("\n");

  const agentRoleUsageHint = agentRoleGuidance
    ? "Agent-role guidance below only helps choose which agent to use after spawning is already authorized; it never authorizes spawning by itself."
    : "";

  return [
    toolDescription,
    "This spawn_agent tool provides you access to smaller but more efficient sub-agents. A mini model can solve many tasks faster than the main model. You should follow the rules and guidelines below to use this tool.",
    "",
    "Only use `spawn_agent` if and only if the user explicitly asks for sub-agents, delegation, or parallel agent work.",
    "Requests for depth, thoroughness, research, investigation, or detailed codebase analysis do not count as permission to spawn.",
    agentRoleUsageHint,
    "",
    "### When to delegate vs. do the subtask yourself",
    "- First, quickly analyze the overall user task and form a succinct high-level plan. Identify which tasks are immediate blockers on the critical path, and which tasks are sidecar tasks that are needed but can run in parallel without blocking the next local step. As part of that plan, explicitly decide what immediate task you should do locally right now. Do this planning step before delegating to agents so you do not hand off the immediate blocking task to a submodel and then waste time waiting on it.",
    "- Use the smaller subagent when a subtask is easy enough for it to handle and can run in parallel with your local work. Prefer delegating concrete, bounded sidecar tasks that materially advance the main task without blocking your immediate next local step.",
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
    "- Use `fork_context` only when inheriting the current session history provides a real speed or quality benefit because re-explaining a long thread would be expensive, usually for debugging or continuing complex in-flight work.",
    "- Do not use `fork_context` for simple or self-contained tasks where a fresh agent can start quickly without the extra history.",
    "- Do not use `fork_context` for tasks that benefit from fresh context and low bias, especially review, audit, or other evaluative work.",
    "",
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

export function registerCodexToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: CodexToolAdapterDeps,
): CodexToolAdapterHandle {
  type RegisteredTool = Parameters<typeof pi.registerTool>[0];
  const spawnAgentParameters = Type.Object({
    name: Type.String({
      description: "Required lowercase public name for the child agent. May include hyphens and underscores.",
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
          "Only use when copying the current persisted session branch into the child will clearly help by avoiding re-explaining a long history and letting the subagent start faster, usually for debugging or continuing complex ongoing work. Never use it for simple self-contained tasks, or for work that benefits from fresh context and low bias such as review or audit tasks.",
      }),
    ),
    model: Type.Optional(
      Type.String({
        description: "Optional model override for the child agent.",
      }),
    ),
    reasoning_effort: Type.Optional(
      Type.String({
        description: "Optional reasoning effort override for the child agent.",
      }),
    ),
    wait_for_agent: Type.Optional(
      Type.Boolean({
        description:
          "If true, wait for agent completion in this call. If false or omitted, return immediately and notify later when the child completes.",
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
        name: validateSubagentName(params.name),
        prompt,
        requestedAgentType: params.agent_type,
        requestedModel: params.model,
        requestedReasoningEffort: params.reasoning_effort,
        runInBackground: params.wait_for_agent !== true,
        interactive: params.interactive,
        forkContext: params.fork_context,
      });

      const completedAgent = result.completedAgent
        ? toPublicAgentSnapshot(result.completedAgent)
        : undefined;

      return {
        content: [
          {
            type: "text",
            text: buildSpawnAgentContent(result.name, completedAgent),
          },
        ],
        details: completedAgent
          ? {
              name: result.name,
              agents: [completedAgent],
              status: { [result.name]: completedAgent.status },
              timed_out: false,
              prompt,
              wait_for_agent: Boolean(params.wait_for_agent),
            }
          : {
              name: result.name,
              prompt,
              wait_for_agent: Boolean(params.wait_for_agent),
            },
      };
    },
    renderCall(args: any, theme: any) {
      const publicName =
        typeof args.name === "string" && args.name.trim().length > 0 ? args.name.trim() : "agent";
      const agentType = resolveRequestedAgentType(args.agent_type);
      const roleLabel = agentType !== "default" ? ` [${agentType}]` : "";
      const modelLabel = formatSubagentModelLabel(args.model, args.reasoning_effort);
      const transportLabel = args.interactive ? theme.fg("muted", " (interactive)") : "";
      const backgroundLabel = args.wait_for_agent ? "" : theme.fg("muted", " (background)");
      const agentName = `${theme.fg("accent", `${publicName}${roleLabel}`)}${modelLabel ? theme.fg("muted", ` (${modelLabel})`) : ""}${transportLabel}`;
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
    ((spawnAgentParameters).properties.agent_type).description = agentTypeDescription;
  };

  refreshRoleDescriptions();
  pi.registerTool(spawnAgentTool);

  pi.registerTool({
    name: "send_message",
    label: "send_message",
    description:
      "Send more work to a persistent child agent. Automatically resumes detached agents, uses queued follow-up semantics by default, and uses steering when interrupt is true.",
    parameters: Type.Object({
      target: Type.String({ description: "Public name of the child agent to message." }),
      message: Type.String({
        description: "Plain-text message to send to the agent.",
      }),
      interrupt: Type.Optional(
        Type.Boolean({
          description: "Use steering semantics when the child is already running.",
        }),
      ),
    }),
    async execute(_toolCallId: any, params: any) {
      const target = validateSubagentName(params.target, "target");
      const input = params.message?.trim();
      if (!input) {
        throw new Error("message is required");
      }

      const result = await deps.lifecycle.resumeByName({
        mode: "codex",
        name: target,
        input,
        interrupt: params.interrupt,
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
    name: "wait_agent",
    label: "wait_agent",
    description:
      "Wait for any child agent to complete a turn. Completed statuses may include the agent's final message. Returns empty status when timed out. Once the agent reaches a completed status, a notification message will be received containing the same completed status.",
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
        content: [{ type: "text", text: buildWaitAgentContent(snapshots, result.timedOut) }],
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
        return renderFallbackResult(result, theme.fg("muted", buildWaitAgentContent([], false)));
      }
      return renderAgentCompletionResult(details, Boolean(options.expanded), theme);
    },
  });

  pi.registerTool({
    name: "close_agent",
    label: "close_agent",
    description: "Close a persistent child agent. Closed agents cannot be resumed.",
    parameters: Type.Object({
      target: Type.String({ description: "Public name of the agent to close." }),
    }),
    async execute(_toolCallId: any, params: any) {
      const target = validateSubagentName(params.target, "target");
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
