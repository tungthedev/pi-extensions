import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import { createWriteStream } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { createShellToolDefinition } from "../../shell/tool.ts";
import {
  getShellEnv,
  readConfiguredShellPath,
  resolveShellInvocation,
} from "../../shell/runtime.ts";

const nativeShellTool = createShellToolDefinition();

const DROID_EXECUTE_DESCRIPTION = `Execute a shell command with optional timeout (in seconds).

CRITICAL: Each command runs in a NEW, ISOLATED shell process. Nothing persists between Execute calls:
- Environment variables are reset
- Virtual environment activations are lost
- Working directory changes are lost
- Installed packages remain, but PATH changes are lost

Before executing commands:
1. Directory Verification:
   - If creating new directories or files, first use the LS tool to verify the parent directory exists
2. Path Quoting:
   - Always quote file paths that contain spaces or special characters with double quotes
3. Working Directory Management:
   - Prefer using absolute paths over changing directories

Tool Usage Guidelines:
- Prefer 'read' tool over cat, head, tail, sed, or awk for viewing files
- Prefer 'LS' tool over ls for exploring directories
- Prefer 'Create' tool over shell redirection for creating files
- Prefer 'Edit' tool over sed or perl for in-place modifications`;

function tempLogPath(): string {
  return join(tmpdir(), `droid-exec-${randomBytes(8).toString("hex")}.log`);
}

async function runInBackground(command: string, cwd: string, timeoutSeconds?: number, login?: boolean) {
  const configuredShellPath = await readConfiguredShellPath();
  const invocation = resolveShellInvocation(command, { login, configuredShellPath });
  const logPath = tempLogPath();
  const stream = createWriteStream(logPath);

  const child = spawn(invocation.shell, invocation.shellArgs, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: getShellEnv(),
  });

  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
  child.unref();

  if (timeoutSeconds && timeoutSeconds > 0) {
    setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore background termination errors
      }
    }, timeoutSeconds * 1000).unref();
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Started command in background. PID: ${child.pid ?? "unknown"}\nLog: ${logPath}`,
      },
    ],
    details: {
      pid: child.pid ?? null,
      logPath,
      workdir: cwd,
      background: true,
    },
  };
}

export function registerDroidExecuteTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "Execute",
    label: "Execute",
    description: DROID_EXECUTE_DESCRIPTION,
    parameters: Type.Object({
      command: Type.String({ description: "The command to execute" }),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in seconds (default: 60)" }),
      ),
      riskLevelReason: Type.String({
        description: "REQUIRED: concise one-sentence explanation justifying the risk level of this command.",
      }),
      riskLevel: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
        description: "REQUIRED: risk level for this command.",
      }),
      fireAndForget: Type.Optional(
        Type.Boolean({
          description: "Run command in background without waiting for completion.",
        }),
      ),
      login: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      if (params.fireAndForget) {
        return await runInBackground(params.command, cwd, params.timeout, params.login);
      }

      return await nativeShellTool.execute(
        _toolCallId,
        {
          command: params.command,
          workdir: cwd,
          timeout_ms: (params.timeout ?? 60) * 1000,
          login: params.login,
        },
        signal,
        _onUpdate,
        ctx,
      );
    },
    renderCall(args, theme, context) {
      return nativeShellTool.renderCall!(
        {
          command: args.command,
          workdir: context.cwd,
          timeout_ms: args.timeout !== undefined ? args.timeout * 1000 : undefined,
          login: args.login,
        },
        theme,
        context as never,
      );
    },
    renderResult(result, options, theme, context) {
      return nativeShellTool.renderResult!(result as never, options, theme, context as never);
    },
  });
}
