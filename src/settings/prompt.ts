import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

import { resolveSessionLoadSkills } from "./session.ts";

const SKILLS_SECTION_START =
  "\n\nThe following skills provide specialized instructions for specific tasks.\nUse the read tool to load a skill's file when the task matches its description.\nWhen a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.\n\n<available_skills>\n";
const SKILLS_SECTION_END = "\n</available_skills>";

export type LoadSkillsPromptDeps = {
  resolveLoadSkills: (ctx: Pick<ExtensionContext, "sessionManager">) => Promise<boolean>;
};

function createDefaultDeps(): LoadSkillsPromptDeps {
  return {
    resolveLoadSkills: (ctx) => resolveSessionLoadSkills(ctx.sessionManager),
  };
}

export function stripSkillListFromPrompt(prompt: string | undefined): string | undefined {
  if (!prompt) return prompt;

  const startIndex = prompt.indexOf(SKILLS_SECTION_START);
  if (startIndex === -1) return prompt;

  const endIndex = prompt.indexOf(SKILLS_SECTION_END, startIndex + SKILLS_SECTION_START.length);
  if (endIndex === -1) {
    return prompt.slice(0, startIndex);
  }

  return prompt.slice(0, startIndex) + prompt.slice(endIndex + SKILLS_SECTION_END.length);
}

export async function handleLoadSkillsBeforeAgentStart(
  event: BeforeAgentStartEvent,
  ctx: ExtensionContext,
  deps: LoadSkillsPromptDeps = createDefaultDeps(),
): Promise<{ systemPrompt: string } | undefined> {
  if (await deps.resolveLoadSkills(ctx)) return undefined;

  const systemPrompt = stripSkillListFromPrompt(event.systemPrompt);
  if (!systemPrompt || systemPrompt === event.systemPrompt) return undefined;
  return { systemPrompt };
}

export function registerLoadSkillsPromptFilter(
  pi: ExtensionAPI,
  deps: LoadSkillsPromptDeps = createDefaultDeps(),
): void {
  pi.on("before_agent_start", async (event, ctx) =>
    handleLoadSkillsBeforeAgentStart(event, ctx, deps),
  );
}
