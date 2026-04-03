import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readTungthedevSettings } from "../settings/config.ts";
import { registerShellTool } from "./tool.ts";

export function syncCustomShellTools(
  activeToolNames: string[],
  allToolNames: string[],
  customShellToolEnabled: boolean,
): string[] {
  const available = new Set(allToolNames);
  const next = activeToolNames.filter((name) => available.has(name) && name !== "shell" && name !== "bash");

  if (customShellToolEnabled) {
    if (available.has("shell")) {
      next.push("shell");
    }
  } else if (available.has("bash")) {
    next.push("bash");
  }

  return next;
}

async function syncShellToolSet(pi: ExtensionAPI): Promise<void> {
  const settings = await readTungthedevSettings();
  const nextActiveTools = syncCustomShellTools(
    pi.getActiveTools(),
    pi.getAllTools().map((tool) => tool.name),
    settings.customShellTool,
  );

  pi.setActiveTools(nextActiveTools);
}

export default function registerShellExtension(pi: ExtensionAPI): void {
  registerShellTool(pi);

  pi.on("session_start", async () => {
    await syncShellToolSet(pi);
  });

  pi.on("session_switch", async () => {
    await syncShellToolSet(pi);
  });

  pi.on("before_agent_start", async () => {
    await syncShellToolSet(pi);
  });
}
