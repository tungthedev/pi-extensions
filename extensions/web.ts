/**
 * Web research and fetching extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerWebExtension from "../src/web/index.js";

export default function web(pi: ExtensionAPI): void {
  registerWebExtension(pi);
}
