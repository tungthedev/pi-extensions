import type { ExtensionToolMetadata } from "../metadata-types.js";

export const SHELL_TOOL_NAMES = ["shell"] as const;

export const SHELL_TOOLS: ExtensionToolMetadata[] = [
  {
    name: SHELL_TOOL_NAMES[0],
    source: "shell",
    capability: "subprocess",
    mutates: true,
    requiresApproval: true,
  },
];
