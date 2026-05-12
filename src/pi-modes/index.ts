import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  applyPiModeActiveTools,
  registerPiModeSettingsExtension,
  type PiModeSettingsOptions,
} from "../settings/index.js";
import { resolveSessionToolSet } from "../settings/session.js";
import type { ToolSetPack } from "../settings/config.js";

import type { CodexContentOptions } from "../codex-content/index.js";
import type { DroidContentOptions } from "../droid-content/index.js";
import type { ShellOptions } from "../shell/index.js";
import type { SubagentsOptions } from "../subagents/index.js";
import type { SystemMdOptions } from "../system-md/index.js";

export interface PiModesOptions {
  settings?: PiModeSettingsOptions | false;
  systemMd?: SystemMdOptions | false;
  shell?: ShellOptions | false;
  codexContent?: CodexContentOptions | false;
  droidContent?: DroidContentOptions | false;
  subagents?: SubagentsOptions | false;
  loadSkillsPromptFilter?: false;
}

type SubagentToolsController = {
  refreshRoleDescriptions(cwd?: string): void;
};

type LazyState = {
  shell?: Promise<void>;
  codexTools?: Promise<void>;
  droidTools?: Promise<void>;
  subagents?: Promise<void>;
  subagentTools?: SubagentToolsController;
};

async function ensureShellTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
): Promise<void> {
  if (options.shell === false) return;
  state.shell ??= import("../shell/tool.js").then(({ registerShellTool }) => {
    registerShellTool(pi);
  });
  await state.shell;
}

async function ensureCodexTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
): Promise<void> {
  if (options.codexContent === false) return;
  state.codexTools ??= import("../codex-content/tools/index.js").then(
    ({ registerCodexCompatibilityTools }) => {
      registerCodexCompatibilityTools(pi);
    },
  );
  await state.codexTools;
}

async function ensureDroidTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
): Promise<void> {
  if (options.droidContent === false) return;
  state.droidTools ??= import("../droid-content/tools/index.js").then(
    ({ registerDroidEasyTools }) => {
      registerDroidEasyTools(pi);
    },
  );
  await state.droidTools;
}

async function ensureSubagentTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
  cwd?: string,
): Promise<void> {
  if (options.subagents === false) return;
  state.subagents ??= import("../subagents/subagents/index.js").then(
    ({ SUBAGENT_CHILD_ENV, registerSubagentTools }) => {
      if (process.env[SUBAGENT_CHILD_ENV] === "1") return;
      state.subagentTools = registerSubagentTools(pi);
    },
  );
  await state.subagents;
  state.subagentTools?.refreshRoleDescriptions(cwd);
}

async function ensureModeTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
  mode: ToolSetPack,
  cwd?: string,
): Promise<void> {
  if (mode === "codex") {
    await Promise.all([
      ensureShellTools(pi, options, state),
      ensureCodexTools(pi, options, state),
      ensureSubagentTools(pi, options, state, cwd),
    ]);
    return;
  }

  if (mode === "droid") {
    await Promise.all([
      ensureDroidTools(pi, options, state),
      ensureSubagentTools(pi, options, state, cwd),
    ]);
    return;
  }

  await ensureSubagentTools(pi, options, state, cwd);
}

async function ensureContextModeTools(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
  ctx: Pick<ExtensionContext, "cwd" | "sessionManager">,
): Promise<ToolSetPack> {
  const mode = await resolveSessionToolSet(ctx.sessionManager);
  await ensureModeTools(pi, options, state, mode, ctx.cwd);
  return mode;
}

async function applyPromptStep(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  currentSystemPrompt: string,
  run: (event: BeforeAgentStartEvent, ctx: ExtensionContext) => Promise<{ systemPrompt: string } | undefined>,
): Promise<string> {
  const result = await run({ ...event, systemPrompt: currentSystemPrompt }, ctx);
  return result?.systemPrompt ?? currentSystemPrompt;
}

async function applyLazyPromptHandlers(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  options: PiModesOptions,
  mode: ToolSetPack,
): Promise<{ systemPrompt: string } | undefined> {
  let systemPrompt = event.systemPrompt;

  if (options.systemMd !== false) {
    const { handleSystemMdBeforeAgentStart } = await import("../system-md/index.js");
    systemPrompt = await applyPromptStep(event, ctx, systemPrompt, handleSystemMdBeforeAgentStart);
  }

  if (mode === "codex" && options.codexContent !== false) {
    const { handleCodexSystemPromptBeforeAgentStart } = await import(
      "../codex-content/system-prompt.js"
    );
    systemPrompt = await applyPromptStep(
      event,
      ctx,
      systemPrompt,
      handleCodexSystemPromptBeforeAgentStart,
    );
  }

  if (mode === "droid" && options.droidContent !== false) {
    const { handleDroidSystemPromptBeforeAgentStart } = await import(
      "../droid-content/system-prompt.js"
    );
    systemPrompt = await applyPromptStep(
      event,
      ctx,
      systemPrompt,
      handleDroidSystemPromptBeforeAgentStart,
    );
  }

  if (options.loadSkillsPromptFilter !== false) {
    const { handleLoadSkillsBeforeAgentStart } = await import("../settings/prompt.js");
    systemPrompt = await applyPromptStep(event, ctx, systemPrompt, handleLoadSkillsBeforeAgentStart);
  }

  return systemPrompt === event.systemPrompt ? undefined : { systemPrompt };
}

function registerLazySubagentsCommand(
  pi: ExtensionAPI,
  options: PiModesOptions,
  state: LazyState,
): void {
  if (options.subagents === false) return;
  pi.registerCommand("subagents", {
    description: "Open the subagents role manager",
    handler: async (_args, ctx) => {
      await ensureSubagentTools(pi, options, state, ctx.cwd);
      const { handleSubagentsCommand } = await import("../subagents/commands.js");
      await handleSubagentsCommand(ctx, pi);
    },
  });
}

export function registerPiModesExtension(pi: ExtensionAPI, options: PiModesOptions = {}): void {
  const state: LazyState = {};

  if (options.settings !== false) registerPiModeSettingsExtension(pi, options.settings);
  registerLazySubagentsCommand(pi, options, state);

  pi.on("session_start", async (_event, ctx) => {
    // Do not block Pi startup on large mode-specific module graphs. Start warming the
    // selected mode in the background; before_agent_start awaits it if the user types first.
    void ensureContextModeTools(pi, options, state, ctx)
      .then(() => applyPiModeActiveTools(pi, ctx))
      .catch(() => undefined);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const mode = await ensureContextModeTools(pi, options, state, ctx);
    await applyPiModeActiveTools(pi, ctx);
    return await applyLazyPromptHandlers(event, ctx, options, mode);
  });
}

export default registerPiModesExtension;
