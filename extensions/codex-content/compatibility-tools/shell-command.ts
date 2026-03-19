import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";

import { renderBashResult } from "../renderers/bash.ts";
import {
  execCommand,
  resolveAbsolutePath,
  resolveShellInvocation,
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
      const workdir = resolveAbsolutePath(ctx.cwd, params.workdir ?? ".");
      const invocation = resolveShellInvocation(params.command, {
        login: params.login,
      });
      const result = await execCommand(invocation.shell, invocation.shellArgs, workdir, {
        timeoutMs: params.timeout_ms,
        signal,
      });
      const merged = [
        `Exit code: ${result.exitCode}`,
        "Output:",
        result.stdout.trimEnd(),
        result.stderr.trimEnd(),
      ]
        .filter(Boolean)
        .join("\n");
      const trimmed = trimToBudget(merged);

      return {
        content: [{ type: "text", text: trimmed.text }],
        details: {
          command: params.command,
          workdir,
          exitCode: result.exitCode,
          shell: invocation.shell,
          shellArgs: invocation.shellArgs,
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
