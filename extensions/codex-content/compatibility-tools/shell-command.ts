import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";

import { renderBashResult } from "../renderers/bash.ts";
import {
  execCommand,
  resolveAbsolutePath,
  resolveShellInvocation,
  splitLeadingCdCommand,
  stripTrailingBackgroundOperator,
  trimToBudget,
} from "./runtime.ts";

export { resolveShellInvocation };

type ShellCommandParams = {
  command?: string;
  workdir?: string;
  timeout_ms?: number;
  login?: boolean;
};

type NormalizedShellInput = {
  command: string;
  workdir: string;
  notes: string[];
};

type ToolResult<TDetails> = AgentToolResult<TDetails> & { isError?: boolean };

function normalizeShellInput(cwd: string, params: ShellCommandParams): NormalizedShellInput {
  let workdir = resolveAbsolutePath(cwd, params.workdir ?? ".");
  let command = String(params.command ?? "").trim();
  const notes: string[] = [];

  const splitCommand = splitLeadingCdCommand(command);
  if (splitCommand) {
    workdir = resolveAbsolutePath(workdir, splitCommand.workdir);
    command = splitCommand.command;
    notes.push(`Normalized leading cd into workdir: ${workdir}`);
  }

  const strippedBackground = stripTrailingBackgroundOperator(command);
  command = strippedBackground.command;
  if (strippedBackground.stripped) {
    notes.push("Ignored trailing background operator `&`.");
  }

  return { command, workdir, notes };
}

function buildShellErrorResult(
  command: string | undefined,
  workdir: string,
  text: string,
): ToolResult<{ command: string | undefined; workdir: string }> {
  return {
    content: [{ type: "text" as const, text }],
    details: { command, workdir },
    isError: true,
  };
}

async function validateWorkdir(workdir: string): Promise<string | undefined> {
  let workdirStats;
  try {
    workdirStats = await fs.stat(workdir);
  } catch {
    return `Error: working directory does not exist: ${workdir}`;
  }

  if (!workdirStats.isDirectory()) {
    return `Error: working directory is not a directory: ${workdir}`;
  }

  return undefined;
}

function formatShellOutput(
  result: { stdout: string; stderr: string; exitCode: number },
  notes: string[],
): string {
  const sections = [`Exit code: ${result.exitCode}`];

  if (result.stdout.trim()) {
    sections.push("Stdout:", result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    sections.push("Stderr:", result.stderr.trimEnd());
  }
  if (!result.stdout.trim() && !result.stderr.trim()) {
    sections.push("(no output)");
  }
  if (notes.length > 0) {
    sections.push("Notes:", ...notes);
  }

  return trimToBudget(sections.join("\n")).text;
}

export function registerShellCommandTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "shell_command",
    label: "shell_command",
    description:
      "Runs a shell command and returns its output. Always set the workdir param when possible.",
    parameters: Type.Object({
      command: Type.String({
        description: "The shell script to execute in the user's shell.",
      }),
      workdir: Type.Optional(
        Type.String({
          description: "The working directory to execute the command in.",
        }),
      ),
      timeout_ms: Type.Optional(
        Type.Number({
          description: "The timeout for the command in milliseconds.",
        }),
      ),
      login: Type.Optional(
        Type.Boolean({
          description: "Whether to run the shell with login shell semantics.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const normalized = normalizeShellInput(ctx.cwd, params);
      if (!normalized.command) {
        return buildShellErrorResult(
          params.command,
          normalized.workdir,
          "Error: shell command is empty after normalization.",
        );
      }

      const workdirError = await validateWorkdir(normalized.workdir);
      if (workdirError) {
        return buildShellErrorResult(params.command, normalized.workdir, workdirError);
      }

      const invocation = resolveShellInvocation(normalized.command, {
        login: params.login,
      });
      const result = await execCommand(invocation.shell, invocation.shellArgs, normalized.workdir, {
        timeoutMs: params.timeout_ms,
        signal,
      });

      return {
        content: [{ type: "text" as const, text: formatShellOutput(result, normalized.notes) }],
        details: {
          command: params.command,
          normalizedCommand: normalized.command,
          workdir: normalized.workdir,
          exitCode: result.exitCode,
          shell: invocation.shell,
          shellArgs: invocation.shellArgs,
          notes: normalized.notes,
        },
        isError: result.exitCode !== 0,
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return undefined;

      const details = (result.details ?? {}) as { command?: string };
      return renderBashResult(theme, { command: details.command }, result, expanded);
    },
  });
}
