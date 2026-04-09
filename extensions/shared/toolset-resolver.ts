import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { resolveSessionToolSet } from "../settings/session.ts";
import { TOOLSET_CONFLICT_RULES, TOOLSET_CONTRIBUTIONS, TOOLSET_MODE_ORDER } from "./toolset-registry.ts";
import type { RegisteredToolInfo, ResolvedToolsetEntry, ToolsetModeId } from "./toolset-types.ts";

export function resolveRegisteredToolInfos(
  tools: Array<{ name: string; description?: string }>,
): RegisteredToolInfo[] {
  const seen = new Set<string>();
  const resolved: RegisteredToolInfo[] = [];

  for (const tool of tools) {
    const name = tool.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    resolved.push({
      name,
      description: tool.description ?? "",
    });
  }

  return resolved;
}

function resolveHiddenToolNames(mode: ToolsetModeId): Set<string> {
  const hidden = new Set<string>();

  for (const rule of TOOLSET_CONFLICT_RULES) {
    if (!rule.when.some((candidate) => candidate === mode)) continue;
    for (const toolName of rule.hides) {
      hidden.add(toolName);
    }
  }

  return hidden;
}

export function resolveToolsetEntries(
  mode: ToolsetModeId,
  registeredTools: RegisteredToolInfo[],
): ResolvedToolsetEntry[] {
  const available = new Map(registeredTools.map((tool) => [tool.name, tool]));
  const hidden = resolveHiddenToolNames(mode);
  const resolved: ResolvedToolsetEntry[] = [];
  const seen = new Set<string>();

  for (const contributionKey of TOOLSET_MODE_ORDER[mode]) {
    const contribution = TOOLSET_CONTRIBUTIONS[contributionKey];
    for (const tool of contribution.tools) {
      if (hidden.has(tool.name) || seen.has(tool.name)) continue;
      const registered = available.get(tool.name);
      if (!registered) continue;
      seen.add(tool.name);
      resolved.push({
        ...registered,
        availability: tool.availability,
      });
    }
  }

  return resolved;
}

export function resolveToolsetToolNames(
  mode: ToolsetModeId,
  registeredTools: RegisteredToolInfo[],
): string[] {
  return resolveToolsetEntries(mode, registeredTools).map((tool) => tool.name);
}

export async function applyResolvedToolset(
  pi: Pick<ExtensionAPI, "getAllTools" | "setActiveTools">,
  sessionManager: { getBranch(): Array<unknown> },
): Promise<{ mode: ToolsetModeId; activeToolNames: string[] }> {
  const mode = await resolveSessionToolSet(sessionManager as never);
  const activeToolNames = resolveToolsetToolNames(mode, resolveRegisteredToolInfos(pi.getAllTools()));
  pi.setActiveTools(activeToolNames);
  return { mode, activeToolNames };
}
