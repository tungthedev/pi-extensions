import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerCodexContentExtension from "../codex-content/index.ts";
import registerDroidContentExtension from "../droid-content/index.ts";
import registerPiModeSettingsExtension from "../settings/index.ts";
import registerShellExtension from "../shell/index.ts";
import registerSubagentsExtension from "../subagents/index.ts";
import registerSystemMdExtension from "../system-md/index.ts";

export default function registerPiModesExtension(pi: ExtensionAPI): void {
  registerPiModeSettingsExtension(pi);
  registerSystemMdExtension(pi);
  registerShellExtension(pi);
  registerCodexContentExtension(pi);
  registerDroidContentExtension(pi);
  registerSubagentsExtension(pi);
}
