import type { AgentToolResult, BashToolDetails, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  DEFAULT_MAX_BYTES,
  createBashToolDefinition,
  formatSize,
  truncateTail,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAbsolutePath } from "../shared/runtime-paths.ts";
import {
  executeShellCommand,
  getShellEnv,
  readConfiguredShellPath,
  resolveShellInvocation,
  splitLeadingCdCommand,
  stripTrailingBackgroundOperator,
} from "./runtime.ts";

type ShellParams = {
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

type ShellToolDetails = BashToolDetails & {
  command: string | undefined;
  normalizedCommand?: string;
  workdir: string;
  exitCode?: number | null;
  shell?: string;
  shellArgs?: string[];
  notes?: string[];
};

type ToolResult<TDetails> = AgentToolResult<TDetails> & { isError?: boolean };

const nativeBashTool = createBashToolDefinition(process.cwd());

function normalizeShellInput(cwd: string, params: ShellParams): NormalizedShellInput {
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
): ToolResult<ShellToolDetails> {
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
    return `Working directory does not exist: ${workdir}\nCannot execute shell commands.`;
  }

  if (!workdirStats.isDirectory()) {
    return `Working directory is not a directory: ${workdir}`;
  }

  return undefined;
}

function getTempFilePath(): string {
  const id = randomBytes(8).toString("hex");
  return join(tmpdir(), `pi-shell-${id}.log`);
}

function appendTruncationNotice(
  outputText: string,
  truncation: ReturnType<typeof truncateTail>,
  fullOutputPath: string,
  fullOutput: string,
  options: { hasCompleteOutput: boolean; totalBytes: number },
): string {
  if (!options.hasCompleteOutput) {
    return `${outputText}\n\n[Output truncated to the last ${formatSize(truncation.outputBytes)} of ${formatSize(options.totalBytes)}. Full output: ${fullOutputPath}]`;
  }

  const startLine = truncation.totalLines - truncation.outputLines + 1;
  const endLine = truncation.totalLines;

  if (truncation.lastLinePartial) {
    const lastLineSize = formatSize(Buffer.byteLength(fullOutput.split("\n").pop() ?? "", "utf-8"));
    return `${outputText}\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). Full output: ${fullOutputPath}]`;
  }

  if (truncation.truncatedBy === "lines") {
    return `${outputText}\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${fullOutputPath}]`;
  }

  return `${outputText}\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${fullOutputPath}]`;
}

async function closeTempFileStream(stream: WriteStream | undefined): Promise<void> {
  if (!stream) return;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      stream.removeListener("finish", onFinish);
      reject(error);
    };
    const onFinish = () => {
      stream.removeListener("error", onError);
      resolve();
    };

    stream.once("error", onError);
    stream.once("finish", onFinish);
    stream.end();
  });
}

function buildShellDetails(
  normalized: NormalizedShellInput,
  params: ShellParams,
  invocation?: { shell: string; shellArgs: string[] },
  options: {
    exitCode?: number | null;
    truncation?: ReturnType<typeof truncateTail>;
    fullOutputPath?: string;
  } = {},
): ShellToolDetails {
  return {
    command: params.command,
    normalizedCommand: normalized.command,
    workdir: normalized.workdir,
    exitCode: options.exitCode,
    shell: invocation?.shell,
    shellArgs: invocation?.shellArgs,
    notes: normalized.notes,
    truncation: options.truncation,
    fullOutputPath: options.fullOutputPath,
  };
}

export function createShellToolDefinition() {
  return {
    name: "shell",
    label: "shell",
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
    async execute(_toolCallId: string, params: ShellParams, signal: AbortSignal | undefined, onUpdate: ((update: { content: Array<{ type: "text"; text: string }>; details: unknown }) => void) | undefined, ctx: { cwd: string }) {
      const normalized = normalizeShellInput(ctx.cwd, params);
      if (!normalized.command) {
        return buildShellErrorResult(
          params.command,
          normalized.workdir,
          "Shell command is empty after normalization.",
        );
      }

      const workdirError = await validateWorkdir(normalized.workdir);
      if (workdirError) {
        return buildShellErrorResult(params.command, normalized.workdir, workdirError);
      }

      const configuredShellPath = await readConfiguredShellPath();
      const invocation = resolveShellInvocation(normalized.command, {
        login: params.login,
        configuredShellPath,
      });

      onUpdate?.({ content: [], details: undefined });

      let tempFilePath: string | undefined;
      let tempFileStream: WriteStream | undefined;
      let totalBytes = 0;
      const chunks: Buffer[] = [];
      let chunksBytes = 0;
      const maxChunksBytes = DEFAULT_MAX_BYTES * 2;
      let droppedBufferedOutput = false;

      const ensureTempFile = () => {
        if (tempFilePath) return;

        tempFilePath = getTempFilePath();
        tempFileStream = createWriteStream(tempFilePath);
        for (const chunk of chunks) {
          tempFileStream.write(chunk);
        }
      };

      const handleData = (data: Buffer) => {
        totalBytes += data.length;
        if (totalBytes > DEFAULT_MAX_BYTES) {
          ensureTempFile();
        }

        tempFileStream?.write(data);
        chunks.push(data);
        chunksBytes += data.length;
        while (chunksBytes > maxChunksBytes && chunks.length > 1) {
          const removed = chunks.shift();
          if (!removed) break;
          droppedBufferedOutput = true;
          chunksBytes -= removed.length;
        }

        if (!onUpdate) return;

        const fullText = Buffer.concat(chunks).toString("utf-8");
        const truncation = truncateTail(fullText);
        if (truncation.truncated) {
          ensureTempFile();
        }

        onUpdate({
          content: [{ type: "text" as const, text: truncation.content || "" }],
          details: buildShellDetails(normalized, params, invocation, {
            truncation: truncation.truncated ? truncation : undefined,
            fullOutputPath: tempFilePath,
          }),
        });
      };

      try {
        const execution = await executeShellCommand(invocation, normalized.workdir, {
          env: getShellEnv(),
          timeoutMs: params.timeout_ms,
          signal,
          onData: handleData,
        });

        const fullOutput = Buffer.concat(chunks).toString("utf-8");
        const truncation = truncateTail(fullOutput);
        if (truncation.truncated) {
          ensureTempFile();
        }
        await closeTempFileStream(tempFileStream);

        const details = buildShellDetails(normalized, params, invocation, {
          exitCode: execution.exitCode,
          truncation: truncation.truncated ? truncation : undefined,
          fullOutputPath: tempFilePath,
        });

        let outputText = truncation.content;
        if (truncation.truncated && tempFilePath) {
          outputText = appendTruncationNotice(outputText, truncation, tempFilePath, fullOutput, {
            hasCompleteOutput: !droppedBufferedOutput,
            totalBytes,
          });
        }

        if (execution.aborted) {
          const text = outputText ? `${outputText}\n\nCommand aborted` : "Command aborted";
          return {
            content: [{ type: "text" as const, text }],
            details,
            isError: true,
          };
        }

        if (execution.timedOut) {
          const timeoutText =
            params.timeout_ms !== undefined
              ? `Command timed out after ${params.timeout_ms}ms`
              : "Command timed out";
          const text = outputText ? `${outputText}\n\n${timeoutText}` : timeoutText;
          return {
            content: [{ type: "text" as const, text }],
            details,
            isError: true,
          };
        }

        if (execution.exitCode !== 0 && execution.exitCode !== null) {
          const text = outputText
            ? `${outputText}\n\nCommand exited with code ${execution.exitCode}`
            : `Command exited with code ${execution.exitCode}`;
          return {
            content: [{ type: "text" as const, text }],
            details,
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: outputText || "(no output)" }],
          details,
        };
      } catch (error) {
        await closeTempFileStream(tempFileStream).catch(() => undefined);

        const message = error instanceof Error ? error.message : String(error);
        const output = Buffer.concat(chunks).toString("utf-8");
        const text = output ? `${output}\n\n${message}` : message;

        return {
          content: [{ type: "text" as const, text }],
          details: buildShellDetails(normalized, params, invocation),
          isError: true,
        };
      }
    },
    renderCall(args: ShellParams, theme: any, context: any) {
      return nativeBashTool.renderCall!(
        {
          command: args.command ?? "",
          timeout: args.timeout_ms !== undefined ? args.timeout_ms / 1000 : undefined,
        },
        theme,
        context as never,
      );
    },
    renderResult(result: any, options: any, theme: any, context: any) {
      return nativeBashTool.renderResult!(
        result as AgentToolResult<BashToolDetails | undefined>,
        options,
        theme,
        context as never,
      );
    },
  };
}

export function registerShellTool(pi: ExtensionAPI): void {
  pi.registerTool(createShellToolDefinition());
}
