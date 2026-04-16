import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { Box, truncateToWidth } from "@mariozechner/pi-tui";

import { ensureSessionFffRuntime, resolveSessionFffRuntimeKey } from "./session-runtime.ts";

const FFF_COMMAND_MESSAGE_TYPE = "fff-command-result";

type FffCommandMessage = {
  title: string;
  body: string;
};

function renderStatusReport(args: {
  status: { state: string; indexedFiles?: number; error?: string };
  metadata: {
    cwd: string;
    projectRoot: string;
    dbDir: string;
    frecencyDbPath: string;
    historyDbPath: string;
    definitionClassification: "heuristic" | "native";
  };
}): string {
  const lines = [
    `state: ${args.status.state}`,
    `indexed files: ${args.status.indexedFiles ?? "unknown"}`,
    `cwd: ${args.metadata.cwd}`,
    `project root: ${args.metadata.projectRoot}`,
    `db dir: ${args.metadata.dbDir}`,
    `frecency db: ${args.metadata.frecencyDbPath}`,
    `history db: ${args.metadata.historyDbPath}`,
    `definition classification: ${args.metadata.definitionClassification}`,
  ];

  if (args.status.error) {
    lines.push(`error: ${args.status.error}`);
  }

  return lines.join("\n");
}

function emitCommandResult(
  pi: Pick<ExtensionAPI, "sendMessage">,
  ctx: Pick<ExtensionCommandContext, "hasUI" | "ui">,
  payload: FffCommandMessage,
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(`${payload.title}\n${payload.body}`, "info");
  }

  pi.sendMessage(
    {
      customType: FFF_COMMAND_MESSAGE_TYPE,
      content: "",
      display: true,
      details: payload,
    },
    { deliverAs: "nextTurn" },
  );
}

async function handleStatusCommand(
  pi: Pick<ExtensionAPI, "sendMessage">,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const runtime = ensureSessionFffRuntime(resolveSessionFffRuntimeKey(ctx), ctx.cwd);
  const [statusResult, metadata] = await Promise.all([runtime.getStatus(), runtime.getMetadata()]);

  if (statusResult.isErr()) {
    emitCommandResult(pi, ctx, {
      title: "FFF Status",
      body: statusResult.error.message,
    });
    return;
  }

  emitCommandResult(pi, ctx, {
    title: "FFF Status",
    body: renderStatusReport({ status: statusResult.value, metadata }),
  });
}

async function handleReindexCommand(
  pi: Pick<ExtensionAPI, "sendMessage">,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const runtime = ensureSessionFffRuntime(resolveSessionFffRuntimeKey(ctx), ctx.cwd);
  const reindexResult = await runtime.reindex();
  if (reindexResult.isErr()) {
    emitCommandResult(pi, ctx, {
      title: "FFF Reindex",
      body: reindexResult.error.message,
    });
    return;
  }

  const [statusResult, metadata] = await Promise.all([runtime.getStatus(), runtime.getMetadata()]);
  emitCommandResult(pi, ctx, {
    title: "FFF Reindex",
    body: statusResult.isErr()
      ? `Reindex requested.\n${statusResult.error.message}`
      : `Reindex requested.\n${renderStatusReport({ status: statusResult.value, metadata })}`,
  });
}

export function registerFffCommands(
  pi: Pick<ExtensionAPI, "registerCommand" | "sendMessage"> & {
    registerMessageRenderer?: ExtensionAPI["registerMessageRenderer"];
  },
): void {
  pi.registerMessageRenderer?.<FffCommandMessage>(
    FFF_COMMAND_MESSAGE_TYPE,
    (message, _options, theme) => {
      const details = message.details as FffCommandMessage | undefined;
      const lines = [theme.fg("customMessageLabel", theme.bold(details?.title ?? "FFF"))];
      if (details?.body) {
        lines.push(...details.body.split("\n").map((line) => theme.fg("toolOutput", line)));
      }

      const content = {
        render(width: number): string[] {
          return lines.map((line) => truncateToWidth(line, width));
        },
        invalidate() {},
      };

      const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
      box.addChild(content);
      return box;
    },
  );

  pi.registerCommand("fff-status", {
    description: "Show FFF index status and storage paths for the current session",
    handler: async (_args, ctx) => {
      await handleStatusCommand(pi, ctx);
    },
  });

  pi.registerCommand("fff-reindex", {
    description: "Trigger an FFF reindex for the current session",
    handler: async (_args, ctx) => {
      await handleReindexCommand(pi, ctx);
    },
  });
}
