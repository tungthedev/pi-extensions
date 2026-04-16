/**
 * Pi modes bundle: settings, codex, droid, shell, system-md, and subagents.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerPiModesExtension from "../src/pi-modes/index.ts";

export default function piModes(pi: ExtensionAPI): void {
  registerPiModesExtension(pi);
}
