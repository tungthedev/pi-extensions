/**
 * Workspace tools bundle: Pi-native file tools and FFF lifecycle support.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerWorkspaceExtension from "../src/workspace/index.js";

export default function workspace(pi: ExtensionAPI): void {
  registerWorkspaceExtension(pi);
}
