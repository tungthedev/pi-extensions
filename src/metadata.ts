import type { ExtensionToolMetadata } from "./metadata-types.js";

import { BOOMERANG_TOOLS } from "./boomerang/metadata.js";
import { CODEX_CONTENT_TOOLS } from "./codex-content/metadata.js";
import { DROID_CONTENT_TOOLS } from "./droid-content/metadata.js";
import { GOAL_TOOLS } from "./goal/metadata.js";
import { SHELL_TOOLS } from "./shell/metadata.js";
import { SUBAGENT_TOOLS } from "./subagents/metadata.js";

export type PiExtensionsMetadataModule =
  | "boomerang"
  | "codex-content"
  | "droid-content"
  | "goal"
  | "shell"
  | "subagents";

const METADATA_BY_MODULE: Record<PiExtensionsMetadataModule, ExtensionToolMetadata[]> = {
  boomerang: BOOMERANG_TOOLS,
  "codex-content": CODEX_CONTENT_TOOLS,
  "droid-content": DROID_CONTENT_TOOLS,
  goal: GOAL_TOOLS,
  shell: SHELL_TOOLS,
  subagents: SUBAGENT_TOOLS,
};

export function getPiExtensionsToolMetadata(
  options: { modules?: PiExtensionsMetadataModule[] } = {},
): ExtensionToolMetadata[] {
  const modules =
    options.modules ?? (Object.keys(METADATA_BY_MODULE) as PiExtensionsMetadataModule[]);
  return modules.flatMap((module) => METADATA_BY_MODULE[module] ?? []);
}
