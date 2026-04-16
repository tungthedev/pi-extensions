import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPiModesInteractiveChildRuntime } from "../pi-modes/child-runtime.ts";
import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";

bootstrapSubagentCwd();

export default function interactiveChildEntry(pi: ExtensionAPI) {
  registerPiModesInteractiveChildRuntime(pi);
}
