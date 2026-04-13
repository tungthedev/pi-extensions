import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerFffCommands } from "./commands.ts";
import {
  disposeSessionFffRuntime,
  ensureSessionFffRuntime,
  resolveSessionFffRuntimeKey,
} from "./session-runtime.ts";

export default function registerFffLifecycleExtension(pi: ExtensionAPI): void {
  registerFffCommands(pi);

  const ensureRuntime = (ctx: {
    cwd: string;
    sessionManager?: { getSessionFile?: () => string | undefined };
  }) => {
    const sessionKey = resolveSessionFffRuntimeKey(ctx);
    const runtime = ensureSessionFffRuntime(sessionKey, ctx.cwd);
    void runtime.ensure();
  };

  pi.on("session_start", async (_event, ctx) => {
    ensureRuntime(ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    ensureRuntime(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    disposeSessionFffRuntime(resolveSessionFffRuntimeKey(ctx));
  });
}
