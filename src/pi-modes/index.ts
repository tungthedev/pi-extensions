import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerCodexContentExtension, type CodexContentOptions } from "../codex-content/index.js";
import { registerDroidContentExtension, type DroidContentOptions } from "../droid-content/index.js";
import {
  registerPiModeSettingsExtension,
  type PiModeSettingsOptions,
} from "../settings/index.js";
import { registerLoadSkillsPromptFilter } from "../settings/prompt.js";
import { registerShellExtension, type ShellOptions } from "../shell/index.js";
import { registerSubagentsExtension, type SubagentsOptions } from "../subagents/index.js";
import { registerSystemMdExtension, type SystemMdOptions } from "../system-md/index.js";

export interface PiModesOptions {
  settings?: PiModeSettingsOptions | false;
  systemMd?: SystemMdOptions | false;
  shell?: ShellOptions | false;
  codexContent?: CodexContentOptions | false;
  droidContent?: DroidContentOptions | false;
  subagents?: SubagentsOptions | false;
  loadSkillsPromptFilter?: false;
}

export function registerPiModesExtension(pi: ExtensionAPI, options: PiModesOptions = {}): void {
  if (options.settings !== false) registerPiModeSettingsExtension(pi, options.settings);
  if (options.systemMd !== false) registerSystemMdExtension(pi, options.systemMd);
  if (options.shell !== false) registerShellExtension(pi, options.shell);
  if (options.codexContent !== false) registerCodexContentExtension(pi, options.codexContent);
  if (options.droidContent !== false) registerDroidContentExtension(pi, options.droidContent);
  if (options.subagents !== false) registerSubagentsExtension(pi, options.subagents);
  if (options.loadSkillsPromptFilter !== false) registerLoadSkillsPromptFilter(pi);
}

export default registerPiModesExtension;
