import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerFffLifecycleExtension from "../fff/index.js";
import registerPiCustomExtension from "../pi-custom/index.js";

export default function registerWorkspaceExtension(pi: ExtensionAPI): void {
  registerFffLifecycleExtension(pi);
  registerPiCustomExtension(pi);
}
