import type { ExtensionToolMetadata } from "../metadata-types.js";

export const BOOMERANG_TOOLS: ExtensionToolMetadata[] = [
  {
    name: "boomerang",
    source: "boomerang",
    capability: "workflow",
    mutates: true,
  },
];
