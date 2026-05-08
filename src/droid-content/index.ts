import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerDroidSystemPrompt } from "./system-prompt.js";
import { registerDroidEasyTools } from "./tools/index.js";

export { DROID_CONTENT_TOOL_NAMES } from "./metadata.js";

export interface DroidContentOptions {}

export function registerDroidContentExtension(
  pi: ExtensionAPI,
  _options: DroidContentOptions = {},
) {
  registerDroidEasyTools(pi);
  registerDroidSystemPrompt(pi);
}

export default registerDroidContentExtension;
