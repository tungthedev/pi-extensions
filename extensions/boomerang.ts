/**
 * Boomerang autonomous task execution and context summarization extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerBoomerangExtension from "../src/boomerang/index.ts";

export default function boomerang(pi: ExtensionAPI): void {
  registerBoomerangExtension(pi);
}
