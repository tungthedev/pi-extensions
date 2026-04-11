import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";

import type { PublicAgentSnapshot } from "./types.ts";

import {
  renderEmptySlot,
  renderFallbackResult,
  renderLines,
  titleLine,
  toolCallLine,
} from "../../shared/renderers/common.ts";
import { validateSubagentName } from "./naming.ts";
import { shorten } from "./render.ts";
import { toPublicAgentSnapshot } from "./results.ts";
import { getSubagentCompletionLabel, getSubagentDisplayName, summarizeTaskRequest } from "./rendering.ts";
import {
  buildTaskTitle,
  extractSnapshotDetails,
  normalizeTaskOutput,
  renderTaskOutput,
} from "./renderers.ts";
import { buildSpawnAgentTypeDescription, resolveAgentProfiles } from "./profiles.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";

export type TaskToolAdapterDeps = {
  lifecycle: ReturnType<typeof createSubagentLifecycleService>;
  normalizeWaitAgentTimeoutMs: (timeoutMs: number | undefined) => number;
};

export function registerTaskToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: TaskToolAdapterDeps,
): void {
  const agentTypeDescription = buildSpawnAgentTypeDescription(resolveAgentProfiles());

  pi.registerTool({
    name: "Task",
    label: "Task",
    description:
      "Spawn a persistent background task (child agent) to perform delegated work asynchronously. Use TaskOutput to retrieve results and TaskStop to terminate a running task.",
    parameters: Type.Object({
      subagent_type: Type.Optional(
        Type.String({
          description: agentTypeDescription,
        }),
      ),
      description: Type.Optional(
        Type.String({
          description: "A short (3-5 word) description of the task.",
        }),
      ),
      name: Type.Optional(
        Type.String({
          description: "Required lowercase public name when spawning a new child task. May include hyphens and underscores.",
        }),
      ),
      prompt: Type.String({
        description: "The task for the agent to perform.",
      }),
      complexity: Type.Optional(
        Type.String({
          description:
            "Optional complexity tier. When set, Task model selection follows the configured complexity-to-model routing in settings.",
        }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description:
            "Run the task in the background. Returns immediately with the public task name. Use TaskOutput to check results.",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "Public name from a previous invocation to resume with full context preserved.",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description: "Optional model override for the task.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskSummary = summarizeTaskRequest(params.description, params.prompt);

      if (params.resume) {
        const name = validateSubagentName(params.resume, "resume");
        const resumed = await deps.lifecycle.resumeByName({
          mode: "task",
          name,
          input: params.prompt,
          taskSummary,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name, submission_id: resumed.submissionId }),
            },
          ],
          details: {
            submission_id: resumed.submissionId,
            task_summary: taskSummary,
            ...toPublicAgentSnapshot(resumed.snapshot),
            input: params.prompt,
            command: resumed.commandType,
          },
        };
      }

      const name = validateSubagentName(params.name);
      const spawned = await deps.lifecycle.spawn({
        mode: "task",
        ctx,
        name,
        prompt: params.prompt,
        requestedAgentType: params.subagent_type,
        requestedModel: params.model,
        requestedReasoningEffort: params.complexity,
        runInBackground: params.run_in_background,
        taskSummary,
      });

      if (!params.run_in_background && spawned.completedAgent) {
        const completedAgent = toPublicAgentSnapshot(spawned.completedAgent);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name,
                status: completedAgent.status,
                output: completedAgent.last_assistant_text ?? completedAgent.last_error ?? "",
              }),
            },
          ],
          details: {
            name,
            task_summary: taskSummary,
            agents: [completedAgent],
            timed_out: false,
          },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ name, status: "running" }),
          },
        ],
        details: {
          task_summary: taskSummary,
          ...toPublicAgentSnapshot(deps.lifecycle.getSnapshotByName(name).snapshot),
        },
      };
    },
    renderCall(args, theme, context) {
      const text = context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
      text.setText(buildTaskTitle(theme, "Task", summarizeTaskRequest(args.description, args.prompt)));
      return text;
    },
    renderResult(result, options, theme) {
      if ((result as { isError?: boolean }).isError) {
        return renderFallbackResult(result, theme.fg("muted", "task"));
      }

      const details = result.details as
        | { agents?: PublicAgentSnapshot[]; name?: string; task_summary?: string }
        | undefined;
      if (details?.agents?.length) {
        const completedAgent = details.agents[0];
        return renderTaskOutput(
          completedAgent?.last_assistant_text ?? completedAgent?.last_error,
          Boolean(options.expanded),
          theme,
        );
      }

      return renderEmptySlot();
    },
  });

  pi.registerTool({
    name: "TaskOutput",
    label: "Result",
    description:
      "Retrieves output from a running or completed background task. Use block=true (default) to wait for task completion, use block=false for a non-blocking status check, and use timeout to control the maximum wait time.",
    parameters: Type.Object({
      name: Type.String({
        description: "The public name returned by a previously launched background Task.",
      }),
      block: Type.Optional(
        Type.Boolean({
          description: "Whether to wait for completion. Defaults to true.",
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description: "Max wait time in milliseconds when block=true. Defaults to 45000, min 30000, max 90000.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const name = validateSubagentName(params.name);

      if (params.block === false) {
        const snapshot = toPublicAgentSnapshot(deps.lifecycle.getSnapshotByName(name).snapshot);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name,
                status: snapshot.status,
                output: snapshot.last_assistant_text ?? snapshot.last_error ?? "",
              }),
            },
          ],
          details: {
            name,
            agents: [snapshot],
            timed_out: false,
          },
        };
      }

      const waited = await deps.lifecycle.waitByNames({
        names: [name],
        timeoutMs: deps.normalizeWaitAgentTimeoutMs(params.timeout),
      });
      const snapshots = waited.snapshots.map(toPublicAgentSnapshot);
      const snapshot = snapshots[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name,
              status: snapshot?.status ?? "running",
              output: snapshot?.last_assistant_text ?? snapshot?.last_error ?? "",
              timed_out: waited.timedOut,
            }),
          },
        ],
        details: {
          name,
          agents: snapshots,
          timed_out: waited.timedOut,
        },
      };
    },
    renderCall(args, theme) {
      const name = typeof args.name === "string" && args.name.trim().length > 0 ? args.name.trim() : "task";
      return new Text(toolCallLine(theme, "Task output", theme.fg("accent", name)), 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as { agents?: PublicAgentSnapshot[]; timed_out?: boolean; name?: string } | undefined;
      const agents = details?.agents ?? [];
      const timedOut = Boolean(details?.timed_out);
      const name = details?.name;

      if (agents.length === 0) {
        const label = timedOut ? "Still running" : "No output available";
        const suffix = name ? theme.fg("accent", shorten(name, 20)) : undefined;
        return renderLines([titleLine(theme, timedOut ? "accent" : "text", label, suffix)]);
      }

      const agent = agents[0];
      const displayName = getSubagentDisplayName(agent);
      const statusColor =
        agent.status === "idle"
          ? "success"
          : agent.status === "failed"
            ? "error"
            : "text";
      const statusLabel = getSubagentCompletionLabel(agent.status);
      const output = agent.last_assistant_text ?? agent.last_error;
      const container = new Container();
      container.addChild(
        new Text(titleLine(theme, statusColor, statusLabel, theme.fg("accent", displayName)), 0, 0),
      );

      const normalizedOutput = normalizeTaskOutput(output);
      if (!normalizedOutput) {
        return container;
      }

      container.addChild(new Spacer(1));
      container.addChild(renderTaskOutput(normalizedOutput, expanded, theme));
      return container;
    },
  });

  pi.registerTool({
    name: "TaskStop",
    label: "TaskStop",
    description:
      "Stops a running background task by its public name. Terminates the child agent associated with the task and returns the resulting closed status.",
    parameters: Type.Object({
      name: Type.String({
        description: "The public name of the background task to stop.",
      }),
    }),
    async execute(_toolCallId, params) {
      const name = validateSubagentName(params.name);
      const result = await deps.lifecycle.stopByName(name);
      const snapshot = toPublicAgentSnapshot(result.snapshot);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ name: snapshot.name, status: snapshot.status }),
          },
        ],
        details: {
          name,
          status: snapshot,
        },
      };
    },
    renderCall(args, theme) {
      const name = typeof args.name === "string" && args.name.trim().length > 0 ? args.name.trim() : "task";
      return new Text(toolCallLine(theme, "Stop task", theme.fg("accent", name)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { status?: PublicAgentSnapshot; name?: string } | undefined;
      const snapshot = extractSnapshotDetails(details?.status ?? details);
      const displayName = snapshot ? getSubagentDisplayName(snapshot) : details?.name ?? "task";
      return new Text(titleLine(theme, "text", "Stopped", theme.fg("accent", displayName)), 0, 0);
    },
  });
}
