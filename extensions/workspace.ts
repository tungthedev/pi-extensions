/**
 * Workspace tools bundle: Pi-native file tools and FFF lifecycle support.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerWorkspaceExtension from "../src/workspace/index.ts";

export default function workspace(pi: ExtensionAPI): void {
  registerWorkspaceExtension(pi);
}
