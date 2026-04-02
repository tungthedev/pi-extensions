import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import {
  execCommand,
  getShellEnv,
  resolveAbsolutePath,
  resolveShellInvocation,
  splitLeadingCdCommand,
  stripTrailingBackgroundOperator,
  trimToBudget,
} from "../../codex-content/compatibility-tools/runtime.ts";

type ShellParams = {
  command: string;
  cwd?: string;
  keep_ansi?: boolean;
  env?: string[];
  description?: string;
  timeout?: number;
};

type NormalizedShellInput = {
  command: string;
  workdir: string;
  notes: string[];
};

type ShellResultDetails = {
  command: string;
  normalizedCommand: string;
  workdir: string;
  exitCode: number;
  shell: string;
  shellArgs: string[];
  notes: string[];
};

function normalizeShellInput(cwd: string, params: ShellParams): NormalizedShellInput {
  let workdir = resolveAbsolutePath(cwd, params.cwd ?? ".");
  let command = params.command.trim();
  const notes: string[] = [];

  const splitCommand = splitLeadingCdCommand(command);
  if (splitCommand) {
    workdir = resolveAbsolutePath(workdir, splitCommand.workdir);
    command = splitCommand.command;
    notes.push(`Normalized leading cd into cwd: ${workdir}`);
  }

  const strippedBackground = stripTrailingBackgroundOperator(command);
  command = strippedBackground.command;
  if (strippedBackground.stripped) {
    notes.push("Ignored trailing background operator '&'.");
  }

  return { command, workdir, notes };
}

function pickEnv(envNames: string[] | undefined): NodeJS.ProcessEnv {
  const baseEnv = getShellEnv();
  if (!envNames || envNames.length === 0) {
    return baseEnv;
  }

  const pickedEnv: NodeJS.ProcessEnv = {};
  for (const envName of envNames) {
    if (envName in baseEnv) {
      pickedEnv[envName] = baseEnv[envName];
    }
  }

  const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === "path") ?? "PATH";
  if (baseEnv[pathKey] !== undefined) {
    pickedEnv[pathKey] = baseEnv[pathKey];
  }

  return {
    ...baseEnv,
    ...pickedEnv,
  };
}

function formatShellOutput(result: { stdout: string; stderr: string; exitCode: number }, notes: string[]): string {
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

export function registerForgeShellTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "shell",
    label: "shell",
    description:
      "Executes shell commands. Use cwd instead of cd in the command string. Prefer dedicated tools for search and editing when they fit better.",
    promptSnippet: "Run shell commands with explicit cwd",
    promptGuidelines: [
      "Use shell for terminal operations like git, build tools, and test runners.",
      "Do not use cd inside shell commands when cwd can be set directly.",
    ],
    parameters: Type.Object({
      command: Type.String({ description: "The shell command to execute." }),
      cwd: Type.Optional(Type.String({ description: "Working directory for the command." })),
      keep_ansi: Type.Optional(Type.Boolean({ description: "Preserve ANSI codes in output when true." })),
      env: Type.Optional(
        Type.Array(Type.String(), {
          description: "Environment variable names to include during execution.",
        }),
      ),
      description: Type.Optional(Type.String({ description: "Short description of what the command does." })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const normalized = normalizeShellInput(ctx.cwd, params);
      const invocation = resolveShellInvocation(normalized.command, { login: false });
      const result = await execCommand(invocation.shell, invocation.shellArgs, normalized.workdir, {
        env: pickEnv(params.env),
        timeoutMs: params.timeout ? params.timeout * 1000 : undefined,
        signal,
      });

      const details: ShellResultDetails = {
        command: params.command,
        normalizedCommand: normalized.command,
        workdir: normalized.workdir,
        exitCode: result.exitCode,
        shell: invocation.shell,
        shellArgs: invocation.shellArgs,
        notes: normalized.notes,
      };

      return {
        content: [{ type: "text", text: formatShellOutput(result, normalized.notes) }],
        details,
        isError: result.exitCode !== 0,
      };
    },
    renderCall(args, theme) {
      const text = `${theme.fg("toolTitle", theme.bold("$ "))}${theme.fg("accent", args.command)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as ShellResultDetails | undefined;
      const firstLine = result.content[0]?.type === "text" ? result.content[0].text.split("\n")[0] : "(no output)";
      if (!expanded) {
        const color = (result as { isError?: boolean }).isError ? "error" : "success";
        return new Text(`${theme.fg(color, firstLine)}`, 0, 0);
      }
      return new Text(result.content[0]?.type === "text" ? result.content[0].text : firstLine, 0, 0);
    },
  });
}

export { formatShellOutput, normalizeShellInput };
