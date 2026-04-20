import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { formatLoadSkillsLabel } from "./ui.ts";

export type LoadSkillsTransitionDeps = {
  writeLoadSkills: (value: boolean) => Promise<void>;
  writeSessionLoadSkills?: (value: boolean) => Promise<void> | void;
  emitLoadSkillsChange?: (value: boolean) => Promise<void> | void;
};

export type SessionLoadSkillsTransitionDeps = {
  writeSessionLoadSkills: (value: boolean) => Promise<void> | void;
  emitLoadSkillsChange?: (value: boolean) => Promise<void> | void;
};

export async function applyLoadSkillsTransition(
  _ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: LoadSkillsTransitionDeps,
  loadSkills: boolean,
): Promise<void> {
  await deps.writeLoadSkills(loadSkills);
  await deps.writeSessionLoadSkills?.(loadSkills);
  await deps.emitLoadSkillsChange?.(loadSkills);
}

export async function applySessionLoadSkillsTransition(
  _ctx: Pick<ExtensionContext, "hasUI" | "ui">,
  deps: SessionLoadSkillsTransitionDeps,
  loadSkills: boolean,
): Promise<void> {
  await deps.writeSessionLoadSkills(loadSkills);
  await deps.emitLoadSkillsChange?.(loadSkills);
}
