import { SUBAGENT_CWD_ENV } from "./subagents/types.ts";

export function bootstrapSubagentCwd(): void {
  const inheritedCwd = process.env[SUBAGENT_CWD_ENV]?.trim();
  if (!inheritedCwd) {
    return;
  }

  try {
    process.chdir(inheritedCwd);
  } catch {
    // Best effort only; child startup should continue even if cwd restoration fails.
  }
}
