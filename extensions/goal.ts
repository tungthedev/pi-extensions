/**
 * Codex-style thread goal tracking and continuation extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerGoalExtension from "../src/goal/index.js";

export default function goal(pi: ExtensionAPI): void {
  registerGoalExtension(pi);
}
