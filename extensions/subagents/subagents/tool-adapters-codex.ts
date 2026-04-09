import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";

import type { AgentSnapshot } from "./types.ts";

import {
  detailLine,
  expandHintLine,
  renderFallbackResult,
  renderLines,
  titleLine,
  toolCallLine,
} from "../../codex-content/renderers/common.ts";
import { buildWaitAgentContent } from "./notifications.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";
import {
  buildSpawnAgentTypeDescription,
  resolveAgentProfiles,
} from "./profiles.ts";
import { resolveRequestedAgentType } from "./profiles-apply.ts";
import { formatSubagentModelLabel, getSubagentDisplayName } from "./rendering.ts";
import {
  extractSnapshotDetails,
  previewTaskText,
  renderAgentCompletionResult,
} from "./renderers.ts";
import type { SubagentRuntimeStore } from "./runtime-store.ts";

const CollabInputItemSchema = Type.Object({
  type: Type.Optional(
    Type.String({
      description: "Input item type: text, image, local_image, skill, or mention.",
    }),
  ),
  text: Type.Optional(Type.String({ description: "Text content when type is text." })),
  image_url: Type.Optional(Type.String({ description: "Image URL when type is image." })),
  path: Type.Optional(
    Type.String({
      description:
        "Path when type is local_image/skill, or structured mention target when type is mention.",
    }),
  ),
  name: Type.Optional(Type.String({ description: "Display name when type is skill or mention." })),
});

export type CodexToolAdapterDeps = {
  store: SubagentRuntimeStore;
  lifecycle: ReturnType<typeof createSubagentLifecycleService>;
  resolveSpawnPrompt: (args: {
    task?: string;
    context?: string;
    message?: string;
    items?: Array<{ type?: string; text?: string; image_url?: string; path?: string; name?: string }>;
  }) => string;
  resolveAgentIdsAlias: (args: { id?: string; agent_id?: string; ids?: string[]; agent_ids?: string[] }) => string[];
  resolveAgentIdAlias: (args: { id?: string; agent_id?: string }, fieldName?: string) => string;
  predictSpawnName: (args: Record<string, unknown>) => string;
  renderSpawnPromptPreview: (prompt: string, theme: ExtensionContext["ui"]["theme"]) => Text;
  toSnapshot: (record: unknown, attachment?: unknown) => AgentSnapshot;
  normalizeWaitAgentTimeoutMs: (timeoutMs: number | undefined) => number;
};

export function registerCodexToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: CodexToolAdapterDeps,
): void {
  pi.registerTool({
    name: "spawn_agent",
    label: "spawn_agent",
    description:
      "Spawn a persistent local child pi agent in RPC mode, optionally wait for completion, and immediately start it on a delegated task.",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "Legacy task field for the child agent." })),
      context: Type.Optional(
        Type.String({
          description: "Optional extra context summary prepended to the delegated task.",
        }),
      ),
      message: Type.Optional(
        Type.String({
          description: "Initial plain-text task for the new agent. Use either message or items.",
        }),
      ),
      items: Type.Optional(
        Type.Array(CollabInputItemSchema, {
          description:
            "Structured input items. Use this to pass explicit mentions or local-image references.",
        }),
      ),
      agent_type: Type.Optional(
        Type.String({
          description: buildSpawnAgentTypeDescription(resolveAgentProfiles()),
        }),
      ),
      fork_context: Type.Optional(
        Type.Boolean({
          description:
            "Clone the current persisted session branch into the child before sending the initial task.",
        }),
      ),
      workdir: Type.Optional(
        Type.String({
          description: "Optional working directory for the child agent. Defaults to the current cwd.",
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
      run_in_background: Type.Optional(
        Type.Boolean({
          description:
            "If true, return immediately and notify later when the child completes. Defaults to waiting in this call.",
        }),
      ),
      interactive: Type.Optional(
        Type.Boolean({
          description:
            "If true, launch the child in a visible multiplexer pane/tab for direct user interaction. Default false. Only use when the user explicitly asks to work in the child session.",
        }),
      ),
      name: Type.Optional(
        Type.String({
          description: "Optional descriptive label for the child agent.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const prompt = deps.resolveSpawnPrompt(params);
      const result = await deps.lifecycle.spawn({
        mode: "codex",
        ctx,
        prompt,
        requestedAgentType: params.agent_type,
        workdir: params.workdir,
        requestedModel: params.model,
        requestedReasoningEffort: params.reasoning_effort,
        runInBackground: params.run_in_background,
        interactive: params.interactive,
        forkContext: params.fork_context,
        displayNameHint: params.name,
        nameSeed: JSON.stringify({
          task: params.task ?? null,
          context: params.context ?? null,
          message: params.message ?? null,
          items: params.items ?? null,
          agent_type: params.agent_type ?? null,
          model: params.model ?? null,
          reasoning_effort: params.reasoning_effort ?? null,
          workdir: params.workdir ?? null,
          interactive: params.interactive ?? null,
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              agent_id: result.agentId,
              nickname: result.nickname ?? null,
              ...(result.completedAgent
                ? {
                    status: { [result.agentId]: result.completedAgent.status },
                    timed_out: false,
                    agent: result.completedAgent,
                    agents: [result.completedAgent],
                  }
                : {}),
            }),
          },
        ],
        details: result.completedAgent
          ? {
              agent_id: result.agentId,
              nickname: result.nickname ?? null,
              agents: [result.completedAgent],
              status: { [result.agentId]: result.completedAgent.status },
              timed_out: false,
              prompt,
            }
          : {
              ...result.record,
              nickname: result.nickname ?? null,
              prompt,
            },
      };
    },
    renderCall(args, theme) {
      const predictedName = deps.predictSpawnName(args as Record<string, unknown>);
      const agentType = resolveRequestedAgentType(args.agent_type);
      const roleLabel = agentType !== "default" ? ` [${agentType}]` : "";
      const modelLabel = formatSubagentModelLabel(args.model, args.reasoning_effort);
      const transportLabel = args.interactive ? theme.fg("muted", " (interactive)") : "";
      const agentName = `${theme.fg("accent", `${predictedName}${roleLabel}`)}${modelLabel ? theme.fg("muted", ` (${modelLabel})`) : ""}${transportLabel}`;
      return new Text(toolCallLine(theme, "Spawn", agentName), 0, 0);
    },
    renderResult(result, options, theme) {
      const details =
        (result.details as
          | ({ agents?: AgentSnapshot[]; timed_out?: boolean; prompt?: string } & AgentSnapshot)
          | undefined) ?? undefined;
      if (details?.agents) {
        return renderAgentCompletionResult(details, Boolean(options.expanded), theme);
      }
      if (!details?.prompt) {
        return renderFallbackResult(result, theme.fg("muted", "spawned"));
      }
      return deps.renderSpawnPromptPreview(details.prompt, theme);
    },
  });

  pi.registerTool({
    name: "send_input",
    label: "send_input",
    description:
      "Send more work to a persistent child agent. Automatically resumes detached agents, uses queued follow-up semantics by default, and uses steering when interrupt is true.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Agent id to message (from spawn_agent)." })),
      agent_id: Type.Optional(Type.String({ description: "Identifier returned by spawn_agent." })),
      message: Type.Optional(
        Type.String({
          description: "Plain-text message to send to the agent.",
        }),
      ),
      items: Type.Optional(
        Type.Array(CollabInputItemSchema, {
          description:
            "Structured input items. Use this to pass explicit mentions or local-image references.",
        }),
      ),
      interrupt: Type.Optional(
        Type.Boolean({
          description: "Use steering semantics when the child is already running.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const agentId = deps.resolveAgentIdAlias(params);
      const input = [params.message?.trim(), params.items?.length ? deps.resolveSpawnPrompt({ items: params.items }) : undefined]
        .filter((value): value is string => Boolean(value))
        .join("\n\n")
        .trim();
      if (!input) {
        throw new Error("input, message, or items is required");
      }

      const result = await deps.lifecycle.resume({
        mode: "codex",
        agentId,
        input,
        interrupt: params.interrupt,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ submission_id: result.submissionId }) }],
        details: {
          submission_id: result.submissionId,
          ...result.snapshot,
          input,
          command: result.commandType,
        },
      };
    },
    renderCall(args, theme) {
      const agentId =
        (typeof args.id === "string" && args.id.trim()) ||
        (typeof args.agent_id === "string" && args.agent_id.trim()) ||
        undefined;
      const record = agentId ? deps.store.getDurableChild(agentId) : undefined;
      const displayName = record
        ? getSubagentDisplayName(deps.toSnapshot(record))
        : agentId ?? "agent";
      return new Text(toolCallLine(theme, "Send input", theme.fg("accent", displayName)), 0, 0);
    },
    renderResult(result, options, theme) {
      const details = (result.details ?? {}) as AgentSnapshot & { input: string };
      if (typeof details.input !== "string") {
        return renderFallbackResult(result, theme.fg("muted", "messaged subagent"));
      }

      const snapshot = extractSnapshotDetails(details);
      const displayName = snapshot ? getSubagentDisplayName(snapshot) : "agent";
      const preview = previewTaskText(
        details.input,
        options.expanded ? Number.MAX_SAFE_INTEGER : 5,
      );
      const lines = [titleLine(theme, "text", "Sent input", theme.fg("accent", displayName))];

      for (const [index, line] of preview.visibleLines.entries()) {
        lines.push(detailLine(theme, line, index === 0));
      }

      if (!options.expanded && preview.hiddenLineCount > 0) {
        lines.push(expandHintLine(theme, preview.hiddenLineCount, "line"));
      }

      return renderLines(lines);
    },
  });

  pi.registerTool({
    name: "wait_agent",
    label: "wait_agent",
    description: "Wait for agents to reach a final status. Returns empty status when timed out.",
    parameters: Type.Object({
      ids: Type.Array(Type.String(), {
        description: "Agent ids to wait on. Pass multiple ids to wait for whichever finishes first.",
      }),
      timeout_ms: Type.Optional(
        Type.Number({
          description: "Maximum time to wait before returning. Defaults to 45000, min 30000, max 90000.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const ids = deps.resolveAgentIdsAlias({ ids: params.ids });
      if (ids.length === 0) {
        throw new Error("ids must be non-empty");
      }

      const result = await deps.lifecycle.wait({
        ids,
        timeoutMs: deps.normalizeWaitAgentTimeoutMs(params.timeout_ms),
      });
      return {
        content: [{ type: "text", text: buildWaitAgentContent(result.snapshots, result.timedOut) }],
        details: {
          agents: result.snapshots,
          status: Object.fromEntries(result.snapshots.map((snapshot) => [snapshot.agent_id, snapshot.status])),
          timed_out: result.timedOut,
        },
      };
    },
    renderCall(args, theme) {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === "string") : [];
      const summary = ids.length === 1 ? ids[0]! : `${ids.length} agents`;
      return new Text(toolCallLine(theme, "Wait", theme.fg("accent", summary)), 0, 0);
    },
    renderResult(result, options, theme) {
      const details = result.details as { agents?: AgentSnapshot[]; timed_out?: boolean } | undefined;
      if (!details) {
        return renderFallbackResult(result, theme.fg("muted", buildWaitAgentContent([], false)));
      }
      return renderAgentCompletionResult(details, Boolean(options.expanded), theme);
    },
  });

  pi.registerTool({
    name: "close_agent",
    label: "close_agent",
    description:
      "Close one or more persistent child agents. Closed agents cannot be resumed.",
    parameters: Type.Object({
      id: Type.Optional(Type.String({ description: "Single agent id to close." })),
      agent_id: Type.Optional(Type.String({ description: "Alias for id." })),
      ids: Type.Optional(Type.Array(Type.String(), { description: "Agent ids to close." })),
      agent_ids: Type.Optional(
        Type.Array(Type.String(), { description: "Alias for ids." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const agentId = deps.resolveAgentIdAlias(params);
      const result = await deps.lifecycle.stop(agentId);
      return {
        content: [{ type: "text", text: `Closed agent ${agentId}` }],
        details: {
          status: result.snapshot,
        },
      };
    },
    renderCall(args, theme) {
      const agentId =
        (typeof args.id === "string" && args.id.trim()) ||
        (typeof args.agent_id === "string" && args.agent_id.trim()) ||
        undefined;
      const record = agentId ? deps.store.getDurableChild(agentId) : undefined;
      const displayName = record
        ? getSubagentDisplayName(deps.toSnapshot(record))
        : agentId ?? "agent";
      return new Text(toolCallLine(theme, "Close", theme.fg("accent", displayName)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { status?: AgentSnapshot } | AgentSnapshot | undefined;
      const snapshot = extractSnapshotDetails(details);
      if (!snapshot) {
        return renderFallbackResult(result, theme.fg("muted", "closed"));
      }
      const displayName = getSubagentDisplayName(snapshot);
      return new Text(titleLine(theme, "text", "Closed", theme.fg("accent", displayName)), 0, 0);
    },
  });
}
