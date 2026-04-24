import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";
import { Container, Text } from "@mariozechner/pi-tui";

import type { PublicAgentSnapshot } from "./types.ts";

import {
  renderEmptySlot,
  renderFallbackResult,
  renderLines,
  toolCallLine,
} from "../../shared/renderers/common.ts";
import { validateSubagentName } from "./naming.ts";
import { shorten } from "./render.ts";
import { toPublicAgentSnapshot } from "./results.ts";
import { summarizeTaskRequest } from "./rendering.ts";
import { resolveRequestedAgentType } from "./profiles-apply.ts";
import {
  normalizeTaskOutput,
  previewTaskText,
} from "./renderers.ts";
import { buildSpawnAgentTypeDescription, resolveAgentProfiles } from "./profiles.ts";
import type { createSubagentLifecycleService } from "./lifecycle-service.ts";

type SchemaWithDescription = { description?: string };

export type TaskToolAdapterDeps = {
  lifecycle: ReturnType<typeof createSubagentLifecycleService>;
  normalizeWaitAgentTimeoutMs: (timeoutMs: number | undefined) => number;
};

export type TaskToolAdapterHandle = {
  refreshRoleDescriptions: (cwd?: string) => void;
};

function resolveTaskToolName(args: { name?: unknown; resume?: unknown }): string {
  if (typeof args.name === "string" && args.name.trim().length > 0) {
    return args.name.trim();
  }
  if (typeof args.resume === "string" && args.resume.trim().length > 0) {
    return args.resume.trim();
  }
  return "task";
}

function resolvePreferredTaskOutput(agent: PublicAgentSnapshot): string | undefined {
  if (agent.status === "running") {
    return agent.update_message ?? agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
  }
  return agent.ping_message ?? agent.last_assistant_text ?? agent.last_error;
}

function renderForegroundTaskResult(
  agent: PublicAgentSnapshot,
  expanded: boolean,
  theme: ExtensionContext["ui"]["theme"],
): Text | Container {
  const output = normalizeTaskOutput(resolvePreferredTaskOutput(agent));
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

export function registerTaskToolAdapters(
  pi: Pick<ExtensionAPI, "registerTool">,
  deps: TaskToolAdapterDeps,
): TaskToolAdapterHandle {
  type RegisteredTool = Parameters<typeof pi.registerTool>[0];
  const taskParameters = Type.Object({
    subagent_type: Type.Optional(
      Type.String({
        description: "",
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
    resume: Type.Optional(
      Type.String({
        description: "Public name from a previous invocation to resume with full context preserved.",
      }),
    ),
  });

  const taskTool: RegisteredTool = {
    name: "Task",
    label: "Task",
    description:
      "Run a delegated task in a child agent and wait for the result before returning.",
    parameters: taskParameters,
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, ctx: any) {
      const taskSummary = summarizeTaskRequest(params.description, params.prompt);

      if (params.resume) {
        const name = validateSubagentName(params.resume, "resume");
        const resumed = await deps.lifecycle.resumeByName({
          mode: "task",
          name,
          input: params.prompt,
          taskSummary,
        });

        const waited = await deps.lifecycle.waitByNames({
          names: [name],
          timeoutMs: deps.normalizeWaitAgentTimeoutMs(undefined),
        });
        const waitedAgent = toPublicAgentSnapshot(
          waited.snapshots[0] ?? deps.lifecycle.getSnapshotByName(name).snapshot,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name,
                submission_id: resumed.submissionId,
                status: waitedAgent.status,
                output: resolvePreferredTaskOutput(waitedAgent) ?? "",
                timed_out: waited.timedOut,
              }),
            },
          ],
          details: {
            submission_id: resumed.submissionId,
            task_summary: taskSummary,
            agents: [waitedAgent],
            timed_out: waited.timedOut,
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
        requestedReasoningEffort: params.complexity,
        runInBackground: false,
        taskSummary,
      });

      const completedAgent = toPublicAgentSnapshot(
        spawned.completedAgent ?? deps.lifecycle.getSnapshotByName(name).snapshot,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name,
              status: completedAgent.status,
              output: resolvePreferredTaskOutput(completedAgent) ?? "",
            }),
          },
        ],
        details: {
          name,
          agents: [completedAgent],
          timed_out: false,
          task_summary: taskSummary,
        },
      };
    },
    renderCall(args: any, theme: any) {
      const publicName = resolveTaskToolName(args);
      const agentType = resolveRequestedAgentType(args.subagent_type);
      const roleLabel = agentType !== "default" ? ` [${agentType}]` : "";
      const taskName = theme.fg("accent", `${publicName}${roleLabel}`);
      const callLine = new Text(toolCallLine(theme, "Task", taskName), 0, 0);

      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      if (!prompt) {
        return callLine;
      }

      const container = new Container();
      container.addChild(callLine);
      container.addChild(new Text(theme.fg("dim", shorten(prompt, 140)), 0, 0));
      return container;
    },
    renderResult(result: any, options: any, theme: any) {
      if ((result as { isError?: boolean }).isError) {
        return renderFallbackResult(result, theme.fg("muted", "task"));
      }

      const details = result.details as
        | { agents?: PublicAgentSnapshot[]; name?: string; task_summary?: string }
        | undefined;
      if (details?.agents?.length) {
        const completedAgent = details.agents[0];
        return renderForegroundTaskResult(
          completedAgent,
          Boolean(options.expanded),
          theme,
        );
      }

      return renderEmptySlot();
    },
  };

  const refreshRoleDescriptions = (cwd = process.cwd()) => {
    const agentTypeDescription = buildSpawnAgentTypeDescription(resolveAgentProfiles({ cwd }));
    ((taskParameters).properties.subagent_type as SchemaWithDescription).description =
      agentTypeDescription;
  };

  refreshRoleDescriptions();
  pi.registerTool(taskTool);

  return { refreshRoleDescriptions };
}
