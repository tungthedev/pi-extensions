import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { SlashCommandInfo } from "@mariozechner/pi-coding-agent";

type ResolveSkillOptions = {
  commands: SlashCommandInfo[];
};

function findSkillCommand(skillName: string, commands: SlashCommandInfo[]): SlashCommandInfo | undefined {
  const commandName = `skill:${skillName}`;
  return commands.find((command) => command.source === "skill" && command.name === commandName);
}

export async function resolveSkillContent(
  skillName: string,
  options: ResolveSkillOptions,
): Promise<{ content: string; skillDir: string }> {
  const trimmed = skillName.trim();
  if (!trimmed) throw new Error("skill is required");

  const skillCommand = findSkillCommand(trimmed, options.commands);
  if (!skillCommand) {
    throw new Error(`Skill "${trimmed}" not found in loaded Pi skills.`);
  }

  const skillFile = skillCommand.sourceInfo.path;
  const content = await readFile(skillFile, "utf8");
  const skillDir = skillCommand.sourceInfo.baseDir ?? dirname(skillFile);

  return { content, skillDir };
}
