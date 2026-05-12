/**
 * Extension manager UI.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerExtManagerExtension from "../src/ext-manager/index.js";

export default function extManager(pi: ExtensionAPI): void {
  registerExtManagerExtension(pi);
}
