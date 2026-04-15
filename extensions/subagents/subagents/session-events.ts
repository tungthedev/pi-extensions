import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { SUBAGENT_ACTIVITY_WIDGET_KEY, SubagentActivityWidget } from "./activity-widget.ts";
import { notifyLegacyRoleWarnings } from "./legacy-role-warnings.ts";
import { clearResolvedAgentProfilesCache } from "./profiles.ts";
import { resolveRoleSet } from "./roles-discovery.ts";
import type { SessionEntryLike } from "./types.ts";
import type { SubagentRuntimeStore } from "./runtime-store.ts";

export type SessionEventsDeps = {
  store: SubagentRuntimeStore;
  closeAllLiveAttachments: (reason: "session_change" | "shutdown") => Promise<void>;
  reconstructDurableRegistry: (entries: SessionEntryLike[]) => void;
};

export function registerSubagentSessionEvents(
  pi: Pick<ExtensionAPI, "on">,
  deps: SessionEventsDeps,
): void {
  pi.on("session_start", async (_event, ctx) => {
    clearResolvedAgentProfilesCache();
    notifyLegacyRoleWarnings(
      ctx as Pick<ExtensionContext, "ui">,
      resolveRoleSet({ cwd: ctx.cwd }).warnings,
      ctx.sessionManager.getSessionFile() ?? ctx.cwd,
    );
    await deps.closeAllLiveAttachments("session_change");
    deps.store.setActiveSessionFile(ctx.sessionManager.getSessionFile());
    deps.reconstructDurableRegistry(ctx.sessionManager.getEntries() as SessionEntryLike[]);
    deps.store.clearActivities();
    deps.store.mountActivityWidget(ctx as Pick<ExtensionContext, "ui">, SUBAGENT_ACTIVITY_WIDGET_KEY, (tui, theme) =>
      new SubagentActivityWidget(
        tui,
        theme,
        () => deps.store.snapshotActivities(),
        () => deps.store.getActivityVersion(),
      ),
    );
  });

  pi.on("agent_start", async () => {
    deps.store.setParentIsStreaming(true);
  });

  pi.on("agent_end", async () => {
    deps.store.setParentIsStreaming(false);
  });

  pi.on("session_shutdown", async () => {
    await deps.closeAllLiveAttachments("shutdown");
    deps.store.clearActivities();
  });
}
