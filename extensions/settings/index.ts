import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  TOOL_SET_CHANGED_EVENT,
  formatToolSetLabel,
  readTungthedevSettings,
  writeCustomShellToolSetting,
  writeSystemMdPromptSetting,
  writeToolSetSetting,
  type ToolSetChangedPayload,
  type ToolSetPack,
  type TungthedevSettings,
} from "./config.ts";
import {
  ensureSessionToolSetSnapshot,
  resolveSessionToolSet,
  writeSessionToolSetSnapshot,
} from "./session.ts";
import {
  formatSystemMdPromptLabel,
  openTungthedevSettingsUi,
  parseSettingsCommand,
} from "./ui.ts";

export type TungthedevCommandDeps = {
  readSettings: () => Promise<TungthedevSettings>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeSessionToolSet: (value: ToolSetPack) => Promise<void> | void;
  writeCustomShellTool: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
  openSettingsUi: (
    ctx: ExtensionCommandContext,
    options: { focus?: "toolSet" | "customShellTool" | "systemMdPrompt" },
  ) => Promise<void>;
};

function getNextToolSet(current: ToolSetPack): ToolSetPack {
  if (current === "pi") return "codex";
  if (current === "codex") return "forge";
  return "pi";
}

async function applyToolSetSelection(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: Pick<
    TungthedevCommandDeps,
    "writeToolSet" | "writeSessionToolSet" | "emitToolSetChange"
  >,
  toolSet: ToolSetPack,
): Promise<void> {
  await deps.writeToolSet(toolSet);
  await deps.writeSessionToolSet(toolSet);
  await deps.emitToolSetChange?.(toolSet);

  if (ctx.hasUI) {
    ctx.ui.notify(`Tool set: ${formatToolSetLabel(toolSet)}`, "info");
  }
}

async function cycleToolSet(
  ctx: Pick<ExtensionContext, "hasUI" | "ui" | "sessionManager">,
  deps: Pick<TungthedevCommandDeps, "writeToolSet" | "writeSessionToolSet" | "emitToolSetChange">,
): Promise<void> {
  const nextToolSet = getNextToolSet(await resolveSessionToolSet(ctx.sessionManager));
  await applyToolSetSelection(ctx, deps, nextToolSet);
}

function createDefaultDeps(pi: ExtensionAPI): TungthedevCommandDeps {
  return {
    readSettings: () => readTungthedevSettings(),
    writeToolSet: (value) => writeToolSetSetting(value),
    writeSessionToolSet: (value) => writeSessionToolSetSnapshot(pi, value),
    writeCustomShellTool: (value) => writeCustomShellToolSetting(value),
    writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
    emitToolSetChange: (value) => {
      pi.events.emit(TOOL_SET_CHANGED_EVENT, {
        toolSet: value,
      } satisfies ToolSetChangedPayload);
    },
    openSettingsUi: (ctx, options) =>
      openTungthedevSettingsUi(ctx, {
        focus: options.focus,
        readSettings: async () => {
          const settings = await readTungthedevSettings();
          return {
            ...settings,
            toolSet: await resolveSessionToolSet(ctx.sessionManager),
          };
        },
        writeToolSet: (value) => writeToolSetSetting(value),
        writeCustomShellTool: (value) => writeCustomShellToolSetting(value),
        writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
        onToolSetChange: async (value) => {
          writeSessionToolSetSnapshot(pi, value);
          pi.events.emit(TOOL_SET_CHANGED_EVENT, {
            toolSet: value,
          } satisfies ToolSetChangedPayload);
        },
      }),
  };
}

export async function handleTungthedevCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: TungthedevCommandDeps,
): Promise<void> {
  const action = parseSettingsCommand(args);

  if (action.action === "invalid") {
    ctx.ui.notify(action.message, "warning");
    return;
  }

  if (action.action === "set-tool-set") {
    await applyToolSetSelection(ctx, deps, action.value);
    return;
  }

  if (action.action === "set-custom-shell-tool") {
    await deps.writeCustomShellTool(action.value);
    ctx.ui.notify(`Custom shell tool: ${action.value ? "Enabled" : "Disabled"}`, "info");
    return;
  }

  if (action.action === "set-system-md-prompt") {
    await deps.writeSystemMdPrompt(action.value);
    ctx.ui.notify(`System.md prompt: ${formatSystemMdPromptLabel(action.value)}`, "info");
    return;
  }

  await deps.openSettingsUi(ctx, {
    focus:
      action.action === "open-tool-set"
        ? "toolSet"
        : action.action === "open-custom-shell-tool"
          ? "customShellTool"
          : action.action === "open-system-md-prompt"
            ? "systemMdPrompt"
            : undefined,
  });
}

export function registerTungthedevCommand(
  pi: ExtensionAPI,
  deps: TungthedevCommandDeps = createDefaultDeps(pi),
): void {
  pi.registerCommand("pi-mode", {
    description: "Open Pi Mode settings or update a package setting",
    handler: async (args, ctx) => {
      await handleTungthedevCommand(args, ctx, deps);
    },
  });
}

export function registerTungthedevShortcut(
  pi: ExtensionAPI,
  deps: TungthedevCommandDeps = createDefaultDeps(pi),
): void {
  if (typeof pi.registerShortcut !== "function") return;

  pi.registerShortcut("ctrl+shift+t", {
    description: "Cycle tool set",
    handler: async (ctx) => {
      await cycleToolSet(ctx, deps);
    },
  });
}

export default function registerTungthedevSettingsExtension(pi: ExtensionAPI) {
  const deps = createDefaultDeps(pi);

  pi.on("session_start", async (_event, ctx) => {
    await ensureSessionToolSetSnapshot(pi, ctx.sessionManager);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await ensureSessionToolSetSnapshot(pi, ctx.sessionManager);
  });

  registerTungthedevCommand(pi, deps);
  registerTungthedevShortcut(pi, deps);
}
