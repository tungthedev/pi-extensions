import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPiModesChildRuntime } from "../pi-modes/child-runtime.js";
import { bootstrapSubagentCwd } from "./cwd-bootstrap.js";

bootstrapSubagentCwd();

export default function codexChildEntry(pi: ExtensionAPI) {
  registerPiModesChildRuntime(pi);
}
