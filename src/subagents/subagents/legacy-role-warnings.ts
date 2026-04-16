import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const shownWarningsByScope = new Map<string, Set<string>>();

export function notifyLegacyRoleWarnings(
  ctx: Pick<ExtensionCommandContext, "ui">,
  warnings: string[],
  scopeKey = "default",
): void {
  const shownWarnings = shownWarningsByScope.get(scopeKey) ?? new Set<string>();
  shownWarningsByScope.set(scopeKey, shownWarnings);
  for (const warning of warnings) {
    if (shownWarnings.has(warning)) continue;
    shownWarnings.add(warning);
    ctx.ui.notify(warning, "warning");
  }
}

export function clearLegacyRoleWarningsForTests(): void {
  shownWarningsByScope.clear();
}
