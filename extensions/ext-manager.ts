/**
 * Extension manager UI.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerExtManagerExtension from "../src/ext-manager/index.ts";

export default function extManager(pi: ExtensionAPI): void {
  registerExtManagerExtension(pi);
}
