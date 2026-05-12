import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerFffCommands } from "./commands.js";
import {
  disposeSessionFffRuntime,
  resolveSessionFffRuntimeKey,
} from "./session-runtime.js";

export default function registerFffLifecycleExtension(pi: ExtensionAPI): void {
  registerFffCommands(pi);

  pi.on("session_start", async () => {
    // FFF startup is intentionally lazy. Commands, path autocomplete, and FFF-backed
    // tools create and initialize the per-session runtime on first use.
  });

  pi.on("before_agent_start", async () => {
    // Keep this hook registered so reload/session lifecycle behavior remains stable,
    // but do not warm the native FFF indexer on every Pi startup or prompt.
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    disposeSessionFffRuntime(resolveSessionFffRuntimeKey(ctx));
  });
}
