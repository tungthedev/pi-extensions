import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import {
  LOAD_SKILLS_CHANGED_EVENT,
  TOOL_SET_CHANGED_EVENT,
  readPiModeSettings,
  type LoadSkillsChangedPayload,
  writeLoadSkillsSetting,
  writeWebToolSetting,
  writeSystemMdPromptSetting,
  writeToolSetSetting,
  type WebToolSettingKey,
  type ToolSetChangedPayload,
  type ToolSetPack,
} from "./config.ts";
import {
  readEditorSettings,
  resolveEditorSettingsWritePath,
  writeEditorSettings,
  type EditorSettingsUpdate,
} from "../editor/config.ts";
import { EDITOR_SETTINGS_CHANGED_EVENT } from "../editor/events.ts";
import {
  applyLoadSkillsTransition,
  applySessionLoadSkillsTransition,
} from "./load-skills-transition.ts";
import {
  ensureSessionLoadSkillsSnapshot,
  ensureSessionToolSetSnapshot,
  resolveSessionLoadSkills,
  resolveSessionToolSet,
  writeSessionLoadSkillsSnapshot,
  writeSessionToolSetSnapshot,
} from "./session.ts";
import { applySessionToolSetTransition, applyToolSetTransition } from "./tool-set-transition.ts";
import {
  formatSystemMdPromptLabel,
  openPiModeSettingsUi,
  parseSettingsCommand,
  type SettingsUiSettings,
} from "./ui.ts";

export type PiModeCommandDeps = {
  readSettings: () => Promise<SettingsUiSettings>;
  writeToolSet: (value: ToolSetPack) => Promise<void>;
  writeSessionToolSet: (value: ToolSetPack) => Promise<void> | void;
  writeSessionLoadSkills: (value: boolean) => Promise<void> | void;
  writeLoadSkills: (value: boolean) => Promise<void>;
  writeSystemMdPrompt: (value: boolean) => Promise<void>;
  writeWebToolSetting: (key: WebToolSettingKey, value: string | undefined) => Promise<void>;
  writeEditorSettings?: (settings: EditorSettingsUpdate, ctx: ExtensionCommandContext) => Promise<void>;
  emitToolSetChange?: (value: ToolSetPack) => Promise<void> | void;
  emitLoadSkillsChange?: (value: boolean) => Promise<void> | void;
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

async function applyLoadSkillsSelection(
  ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: Pick<
    PiModeCommandDeps,
    "writeLoadSkills" | "writeSessionLoadSkills" | "emitLoadSkillsChange"
  >,
  loadSkills: boolean,
): Promise<void> {
  await applyLoadSkillsTransition(ctx, deps, loadSkills);
}

async function cycleToolSet(
  ctx: Pick<ExtensionContext, "hasUI" | "ui" | "sessionManager">,
  deps: Pick<PiModeCommandDeps, "writeSessionToolSet" | "emitToolSetChange">,
): Promise<void> {
  const nextToolSet = getNextToolSet(await resolveSessionToolSet(ctx.sessionManager));
  await applySessionToolSetTransition(ctx, deps, nextToolSet);
}

async function toggleLoadSkills(
  ctx: Pick<ExtensionContext, "hasUI" | "ui" | "sessionManager">,
  deps: Pick<PiModeCommandDeps, "writeSessionLoadSkills" | "emitLoadSkillsChange">,
): Promise<void> {
  const nextLoadSkills = !(await resolveSessionLoadSkills(ctx.sessionManager));
  await applySessionLoadSkillsTransition(ctx, deps, nextLoadSkills);
}

function createDefaultDeps(pi: ExtensionAPI): PiModeCommandDeps {
  return {
    readSettings: () => readPiModeSettings(),
    writeToolSet: (value) => writeToolSetSetting(value),
    writeSessionToolSet: (value) => writeSessionToolSetSnapshot(pi, value),
    writeSessionLoadSkills: (value) => writeSessionLoadSkillsSnapshot(pi, value),
    writeLoadSkills: (value) => writeLoadSkillsSetting(value),
    writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
    writeWebToolSetting: (key, value) => writeWebToolSetting(key, value),
    emitToolSetChange: (value) => {
      pi.events.emit(TOOL_SET_CHANGED_EVENT, {
        toolSet: value,
      } satisfies ToolSetChangedPayload);
    },
    emitLoadSkillsChange: (value) => {
      pi.events.emit(LOAD_SKILLS_CHANGED_EVENT, {
        loadSkills: value,
      } satisfies LoadSkillsChangedPayload);
    },
    openSettingsUi: (ctx, options) =>
      openPiModeSettingsUi(ctx, {
        focus: options.focus,
        readSettings: async () => {
          const settings = await readPiModeSettings();
          return {
            ...settings,
            toolSet: await resolveSessionToolSet(ctx.sessionManager),
            loadSkills: await resolveSessionLoadSkills(ctx.sessionManager),
            editor: await readEditorSettings({ cwd: ctx.cwd }),
          };
        },
        applyLoadSkillsTransition: (transitionCtx, value) =>
          applyLoadSkillsTransition(
            transitionCtx,
            {
              writeLoadSkills: (loadSkills) => writeLoadSkillsSetting(loadSkills),
              writeSessionLoadSkills: (loadSkills) =>
                writeSessionLoadSkillsSnapshot(pi, loadSkills),
              emitLoadSkillsChange: (loadSkills) => {
                pi.events.emit(LOAD_SKILLS_CHANGED_EVENT, {
                  loadSkills,
                } satisfies LoadSkillsChangedPayload);
              },
            },
            value,
          ),
        writeSystemMdPrompt: (value) => writeSystemMdPromptSetting(value),
        writeWebToolSetting: (key, value) => writeWebToolSetting(key, value),
        writeEditorSettings: async (settings) => {
          const settingsPath = await resolveEditorSettingsWritePath({ cwd: ctx.cwd });
          await writeEditorSettings(settings, settingsPath);
          pi.events.emit(EDITOR_SETTINGS_CHANGED_EVENT, { settings });
        },
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
    await applyLoadSkillsSelection(ctx, deps, action.value);
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

  pi.registerShortcut("ctrl+space", {
    description: "Cycle tool set",
    handler: async (ctx) => {
      await cycleToolSet(ctx, deps);
    },
  });

  pi.registerShortcut("ctrl+alt+k", {
    description: "Toggle Inject Skills for this session",
    handler: async (ctx) => {
      await toggleLoadSkills(ctx, deps);
    },
  });
}

export default function registerPiModeSettingsExtension(pi: ExtensionAPI) {
  const deps = createDefaultDeps(pi);

  pi.on("session_start", async (_event, ctx) => {
    await ensureSessionToolSetSnapshot(pi, ctx.sessionManager);
    await ensureSessionLoadSkillsSnapshot(pi, ctx.sessionManager);
  });

  registerPiModeCommand(pi, deps);
  registerPiModeShortcut(pi, deps);
}
