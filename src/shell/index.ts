import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerShellTool } from "./tool.js";

export { SHELL_TOOL_NAMES } from "./metadata.js";

export interface ShellOptions {}

export function registerShellExtension(pi: ExtensionAPI, _options: ShellOptions = {}): void {
  registerShellTool(pi);
}

export default registerShellExtension;
