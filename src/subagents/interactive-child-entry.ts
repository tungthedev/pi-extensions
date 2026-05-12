import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPiModesInteractiveChildRuntime } from "../pi-modes/child-runtime.js";
import { bootstrapSubagentCwd } from "./cwd-bootstrap.js";

bootstrapSubagentCwd();

export default function interactiveChildEntry(pi: ExtensionAPI) {
  registerPiModesInteractiveChildRuntime(pi);
}
