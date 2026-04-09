import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";

import type { AgentSnapshot } from "./types.ts";

import {
  renderEmptySlot,
  renderFallbackResult,
  renderLines,
  titleLine,
  toolCallLine,
} from "../../codex-content/renderers/common.ts";
import { shorten } from "./render.ts";
import { getSubagentCompletionLabel, getSubagentDisplayName, summarizeTaskRequest } from "./rendering.ts";
import {
  buildTaskTitle,
  extractSnapshotDetails,
  normalizeTaskOutput,
  renderTaskOutput,
} from "./renderers.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";
import type { SubagentRuntimeStore } from "./runtime-store.ts";

export type TaskToolAdapterDeps = {
  store: SubagentRuntimeStore;
  lifecycle: ReturnType<typeof createSubagentLifecycleService>;
  toSnapshot: (record: unknown, attachment?: unknown) => AgentSnapshot;
  normalizeWaitAgentTimeoutMs: (timeoutMs: number | undefined) => number;
};

export function registerTaskToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: TaskToolAdapterDeps,
): void {
  pi.registerTool({
    name: "Task",
    label: "Task",
    description:
      "Spawn a persistent background task (child agent) to perform delegated work asynchronously.\n\nEach task runs in its own isolated agent session. Use TaskOutput to retrieve results and TaskStop to terminate a running task.\n\nKey behaviors:\n- Returns a task_id immediately when run_in_background=true\n- Blocks until completion when run_in_background=false (default)\n- Tasks can be resumed after completion using the resume field",
    parameters: Type.Object({
      subagent_type: Type.Optional(
        Type.String({
          description: "Optional agent type for the task. Defaults to the standard agent type.",
        }),
      ),
      description: Type.Optional(
        Type.String({
          description: "Optional descriptive label for the task.",
        }),
      ),
      prompt: Type.String({
        description: "The task prompt to send to the child agent.",
      }),
      complexity: Type.Optional(
        Type.String({
          description: "Reasoning effort for the child agent. One of: low, medium, high, xhigh.",
        }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description:
            "If true, return immediately with a task_id. If false, wait for completion.",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "task_id of an existing task to resume with a new prompt.",
        }),
      ),
      workdir: Type.Optional(
        Type.String({
          description: "Working directory for the task. Defaults to current cwd.",
        }),
      ),
      model: Type.Optional(
        Type.String({
          description: "Optional model override for the task.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.resume) {
        const taskSummary = summarizeTaskRequest(params.description, params.prompt);
        const resumed = await deps.lifecycle.resume({
          mode: "task",
          agentId: params.resume,
          input: params.prompt,
          taskSummary,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ submission_id: resumed.submissionId }) }],
          details: {
            task_id: params.resume,
            submission_id: resumed.submissionId,
            task_summary: taskSummary,
            ...resumed.snapshot,
            input: params.prompt,
            command: resumed.commandType,
          },
        };
      }

      const taskSummary = summarizeTaskRequest(params.description, params.prompt);
      const spawned = await deps.lifecycle.spawn({
        mode: "task",
        ctx,
        prompt: params.prompt,
        requestedAgentType: params.subagent_type,
        workdir: params.workdir,
        requestedModel: params.model,
        requestedReasoningEffort: params.complexity,
        runInBackground: params.run_in_background,
        displayNameHint: params.description,
        nameSeed: JSON.stringify({ prompt: params.prompt, type: params.subagent_type, workdir: params.workdir ?? ctx.cwd }),
        taskSummary,
      });

      if (!params.run_in_background && spawned.completedAgent) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task_id: spawned.agentId,
                status: spawned.completedAgent.status,
                output: spawned.completedAgent.last_assistant_text ?? spawned.completedAgent.last_error ?? "",
              }),
            },
          ],
          details: {
            task_id: spawned.agentId,
            nickname: spawned.nickname ?? null,
            task_summary: taskSummary,
            agents: [spawned.completedAgent],
            timed_out: false,
          },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ task_id: spawned.agentId, status: "running", nickname: spawned.nickname }),
          },
        ],
        details: {
          task_id: spawned.agentId,
          nickname: spawned.nickname ?? null,
          task_summary: taskSummary,
          ...deps.toSnapshot(spawned.record, spawned.attachment),
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
        | { agents?: AgentSnapshot[]; nickname?: string; task_id?: string; task_summary?: string }
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
      "Retrieve the output or current status of a background task.\n\nWhen block=true, waits for the task to finish before returning.\nWhen block=false, returns the current state immediately without waiting.",
    parameters: Type.Object({
      task_id: Type.String({
        description: "The task_id returned by the Task tool.",
      }),
      block: Type.Optional(
        Type.Boolean({
          description: "If true, wait for task completion. If false, return current status immediately. Defaults to true.",
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description: "Maximum time to wait in milliseconds when block=true. Defaults to 45000.",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const agentId = params.task_id?.trim();
      if (!agentId) {
        throw new Error("task_id is required");
      }

      if (params.block === false) {
        const { snapshot } = deps.lifecycle.getSnapshot(agentId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                task_id: agentId,
                status: snapshot.status,
                output: snapshot.last_assistant_text ?? snapshot.last_error ?? "",
              }),
            },
          ],
          details: {
            task_id: agentId,
            agents: [snapshot],
            timed_out: false,
          },
        };
      }

      const waited = await deps.lifecycle.wait({
        ids: [agentId],
        timeoutMs: deps.normalizeWaitAgentTimeoutMs(params.timeout),
      });
      const snapshot = waited.snapshots[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              task_id: agentId,
              status: snapshot?.status ?? "running",
              output: snapshot?.last_assistant_text ?? snapshot?.last_error ?? "",
              timed_out: waited.timedOut,
            }),
          },
        ],
        details: {
          task_id: agentId,
          agents: waited.snapshots,
          timed_out: waited.timedOut,
        },
      };
    },
    renderCall(args, theme) {
      const taskId = typeof args.task_id === "string" && args.task_id.trim().length > 0 ? args.task_id.trim() : "task";
      const record = deps.store.getDurableChild(taskId);
      const displayName = record ? getSubagentDisplayName(deps.toSnapshot(record)) : shorten(taskId, 20);
      return new Text(toolCallLine(theme, "Task output", theme.fg("accent", displayName)), 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as { agents?: AgentSnapshot[]; timed_out?: boolean; task_id?: string } | undefined;
      const agents = details?.agents ?? [];
      const timedOut = Boolean(details?.timed_out);
      const taskId = details?.task_id;

      if (agents.length === 0) {
        const label = timedOut ? "Still running" : "No output available";
        const suffix = taskId ? theme.fg("accent", shorten(taskId, 20)) : undefined;
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
      "Stop a running background task cleanly. Terminates the child agent associated with the given task_id and retains a closed record.",
    parameters: Type.Object({
      task_id: Type.String({
        description: "The task_id of the task to stop.",
      }),
    }),
    async execute(_toolCallId, params) {
      const agentId = params.task_id?.trim();
      if (!agentId) {
        throw new Error("task_id is required");
      }

      const result = await deps.lifecycle.stop(agentId);
      return {
        content: [{ type: "text", text: `Stopped task ${agentId}` }],
        details: {
          task_id: agentId,
          status: result.snapshot,
        },
      };
    },
    renderCall(args, theme) {
      const taskId = typeof args.task_id === "string" && args.task_id.trim().length > 0 ? args.task_id.trim() : "task";
      const record = deps.store.getDurableChild(taskId);
      const displayName = record ? getSubagentDisplayName(deps.toSnapshot(record)) : shorten(taskId, 20);
      return new Text(toolCallLine(theme, "Stop task", theme.fg("accent", displayName)), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { status?: AgentSnapshot; task_id?: string } | undefined;
      const snapshot = extractSnapshotDetails(details?.status ?? details);
      const displayName = snapshot ? getSubagentDisplayName(snapshot) : details?.task_id ?? "task";
      return new Text(titleLine(theme, "text", "Stopped", theme.fg("accent", displayName)), 0, 0);
    },
  });
}
