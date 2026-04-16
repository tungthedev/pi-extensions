import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerFffLifecycleExtension from "../fff/index.ts";
import registerPiCustomExtension from "../pi-custom/index.ts";

export default function registerWorkspaceExtension(pi: ExtensionAPI): void {
  registerFffLifecycleExtension(pi);
  registerPiCustomExtension(pi);
}
