import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
      let workdir = resolveAbsolutePath(ctx.cwd, params.workdir ?? ".");
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

      if (!command) {
        return {
          content: [{ type: "text", text: "Error: shell command is empty after normalization." }],
          details: {
            command: params.command,
            workdir,
          },
          isError: true,
        };
      }

      let workdirStats;
      try {
        workdirStats = await fs.stat(workdir);
      } catch {
        return {
          content: [{ type: "text", text: `Error: working directory does not exist: ${workdir}` }],
          details: {
            command: params.command,
            workdir,
          },
          isError: true,
        };
      }
      if (!workdirStats.isDirectory()) {
        return {
          content: [
            { type: "text", text: `Error: working directory is not a directory: ${workdir}` },
          ],
          details: {
            command: params.command,
            workdir,
          },
          isError: true,
        };
      }

      const invocation = resolveShellInvocation(command, {
        login: params.login,
      });
      const result = await execCommand(invocation.shell, invocation.shellArgs, workdir, {
        timeoutMs: params.timeout_ms,
        signal,
      });
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
      const merged = sections.join("\n");
      const trimmed = trimToBudget(merged);

      return {
        content: [{ type: "text", text: trimmed.text }],
        details: {
          command: params.command,
          normalizedCommand: command,
          workdir,
          exitCode: result.exitCode,
          shell: invocation.shell,
          shellArgs: invocation.shellArgs,
          notes,
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
