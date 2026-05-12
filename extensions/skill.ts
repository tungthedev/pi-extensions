/**
 * Skill loading extension.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerSkillExtension from "../src/skill/index.js";

export default function skill(pi: ExtensionAPI): void {
  registerSkillExtension(pi);
}
