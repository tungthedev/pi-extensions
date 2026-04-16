import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPiModesChildRuntime } from "../pi-modes/child-runtime.ts";
import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";

bootstrapSubagentCwd();

export default function codexChildEntry(pi: ExtensionAPI) {
  registerPiModesChildRuntime(pi);
}
