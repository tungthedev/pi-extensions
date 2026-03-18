import { rename } from "node:fs/promises";

import type { LocalExtensionEntry, State } from "../types.ts";

export async function setLocalExtensionState(
  entry: Pick<LocalExtensionEntry, "activePath" | "disabledPath">,
  target: State,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (target === "enabled") {
      await rename(entry.disabledPath, entry.activePath);
    } else {
      await rename(entry.activePath, entry.disabledPath);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
