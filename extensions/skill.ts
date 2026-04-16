/**
 * Skill loading extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerSkillExtension from "../src/skill/index.ts";

export default function skill(pi: ExtensionAPI): void {
  registerSkillExtension(pi);
}
