import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import {
  TOOL_SET_CHANGED_EVENT,
  readPiModeSettings,
  writeLoadSkillsSetting,
  writeWebToolSetting,
  writeSystemMdPromptSetting,
  writeToolSetSetting,
  type WebToolSettingKey,
  type ToolSetChangedPayload,
  type ToolSetPack,
  type PiModeSettings,
} from "./config.ts";
import {
  ensureSessionToolSetSnapshot,
  resolveSessionToolSet,
  writeSessionToolSetSnapshot,
} from "./session.ts";
import { applySessionToolSetTransition, applyToolSetTransition } from "./tool-set-transition.ts";
import {
  formatLoadSkillsLabel,
  formatSystemMdPromptLabel,
  openPiModeSettingsUi,
  parseSettingsCommand,
} from "./ui.ts";

export type PiModeCommandDeps = {
  readSettings: () => Promise<PiModeSettings>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeSessionToolSet: (value: ToolSetPack) => Promise<void> | void;
  writeLoadSkills: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  writeWebToolSetting: (key: WebToolSettingKey, value: string | undefined) => Promise<void>;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
  openSettingsUi: (
    ctx: ExtensionCommandContext,
    options: { focus?: "toolSet" | "loadSkills" | "systemMdPrompt" },
  ) => Promise<void>;
};

function getNextToolSet(current: ToolSetPack): ToolSetPack {
  if (current === "pi") return "codex";
  if (current === "codex") return "droid";
  return "pi";
}

async function applyToolSetSelection(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: Pick<PiModeCommandDeps, "writeToolSet" | "writeSessionToolSet" | "emitToolSetChange">,
  toolSet: ToolSetPack,
): Promise<void> {
  await applyToolSetTransition(ctx, deps, toolSet);
}

async function cycleToolSet(
  ctx: Pick<ExtensionContext, "hasUI" | "ui" | "sessionManager">,
  deps: Pick<PiModeCommandDeps, "writeSessionToolSet" | "emitToolSetChange">,
): Promise<void> {
  const nextToolSet = getNextToolSet(await resolveSessionToolSet(ctx.sessionManager));
  await applySessionToolSetTransition(ctx, deps, nextToolSet);
}

function createDefaultDeps(pi: ExtensionAPI): PiModeCommandDeps {
  return {
    readSettings: () => readPiModeSettings(),
    writeToolSet: (value) => writeToolSetSetting(value),
    writeSessionToolSet: (value) => writeSessionToolSetSnapshot(pi, value),
    writeLoadSkills: (value) => writeLoadSkillsSetting(value),
    writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
    writeWebToolSetting: (key, value) => writeWebToolSetting(key, value),
    emitToolSetChange: (value) => {
      pi.events.emit(TOOL_SET_CHANGED_EVENT, {
        toolSet: value,
      } satisfies ToolSetChangedPayload);
    },
    openSettingsUi: (ctx, options) =>
      openPiModeSettingsUi(ctx, {
        focus: options.focus,
        readSettings: async () => {
          const settings = await readPiModeSettings();
          return {
            ...settings,
            toolSet: await resolveSessionToolSet(ctx.sessionManager),
          };
        },
        writeLoadSkills: (value) => writeLoadSkillsSetting(value),
        writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
        writeWebToolSetting: (key, value) => writeWebToolSetting(key, value),
        applyToolSetTransition: (ctx, value) =>
          applyToolSetTransition(
            ctx,
            {
              writeToolSet: (toolSet) => writeToolSetSetting(toolSet),
              writeSessionToolSet: (toolSet) => writeSessionToolSetSnapshot(pi, toolSet),
              emitToolSetChange: (toolSet) => {
                pi.events.emit(TOOL_SET_CHANGED_EVENT, {
                  toolSet,
                } satisfies ToolSetChangedPayload);
              },
            },
            value,
          ),
      }),
  };
}

export async function handlePiModeCommand(
  args: string,
  ctx: ExtensionCommandContext,
  deps: PiModeCommandDeps,
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

  if (action.action === "set-load-skills") {
    await deps.writeLoadSkills(action.value);
    ctx.ui.notify(`Load Skills: ${formatLoadSkillsLabel(action.value)}`, "info");
    return;
  }

  if (action.action === "set-system-md-prompt") {
    await deps.writeSystemMdPrompt(action.value);
    ctx.ui.notify(`Inject SYSTEM.md: ${formatSystemMdPromptLabel(action.value)}`, "info");
    return;
  }

  await deps.openSettingsUi(ctx, {
    focus:
      action.action === "open-tool-set"
        ? "toolSet"
        : action.action === "open-load-skills"
          ? "loadSkills"
        : action.action === "open-system-md-prompt"
          ? "systemMdPrompt"
          : undefined,
  });
}

export function registerPiModeCommand(
  pi: ExtensionAPI,
  deps: PiModeCommandDeps = createDefaultDeps(pi),
): void {
  pi.registerCommand("pi-mode", {
    description: "Open Pi Mode settings or update a package setting",
    handler: async (args, ctx) => {
      await handlePiModeCommand(args, ctx, deps);
    },
  });
}

export function registerPiModeShortcut(
  pi: ExtensionAPI,
  deps: PiModeCommandDeps = createDefaultDeps(pi),
): void {
  if (typeof pi.registerShortcut !== "function") return;

  pi.registerShortcut("ctrl+shift+t", {
    description: "Cycle tool set",
    handler: async (ctx) => {
      await cycleToolSet(ctx, deps);
    },
  });
}

export default function registerPiModeSettingsExtension(pi: ExtensionAPI) {
  const deps = createDefaultDeps(pi);

  pi.on("session_start", async (_event, ctx) => {
    await ensureSessionToolSetSnapshot(pi, ctx.sessionManager);
  });

  registerPiModeCommand(pi, deps);
  registerPiModeShortcut(pi, deps);
}
