import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { renderFallbackResult, renderToolCall } from "../../codex-content/renderers/common.ts";

const DROID_SKILL_DESCRIPTION = `Load and apply a skill by name.

Looks up the named skill in the available skill directories and returns its instructions for the agent to follow.`;

function getSkillSearchPaths(): string[] {
  return [
    join(homedir(), ".agents", "skills"),
    join(homedir(), ".config", "agents", "skills"),
    join(homedir(), ".pi", "agent", "skills"),
  ];
}

async function findSkillDirectory(
  skillName: string,
): Promise<string | undefined> {
  const searchPaths = getSkillSearchPaths();
  for (const basePath of searchPaths) {
    const skillDir = join(basePath, skillName);
    try {
      const s = await stat(skillDir);
      if (s.isDirectory()) return skillDir;
    } catch {
      // skip
    }
  }
  return undefined;
}

async function readSkillContent(
  skillDir: string,
): Promise<string> {
  const skillFile = join(skillDir, "SKILL.md");
  try {
    return await readFile(skillFile, "utf8");
  } catch {
    throw new Error(`SKILL.md not found in skill directory: ${skillDir}`);
  }
}

export async function resolveSkillContent(
  skillName: string,
): Promise<{ content: string; skillDir: string }> {
  const trimmed = skillName.trim();
  if (!trimmed) throw new Error("skill is required");

  const skillDir = await findSkillDirectory(trimmed);
  if (!skillDir) {
    throw new Error(
      `Skill "${trimmed}" not found. Checked: ${getSkillSearchPaths().join(", ")}`,
    );
  }

  const content = await readSkillContent(skillDir);
  return { content, skillDir };
}

export function registerDroidSkillTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "Skill",
    label: "Skill",
    description: DROID_SKILL_DESCRIPTION,
    parameters: Type.Object({
      skill: Type.String({
        description: "The name of the skill to load and apply.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { content, skillDir } = await resolveSkillContent(params.skill);

      return {
        content: [
          {
            type: "text" as const,
            text: content,
          },
        ],
        details: {
          skill: params.skill.trim(),
          skill_dir: skillDir,
        },
      };
    },
    renderCall(args, theme) {
      const skillName = typeof args.skill === "string" && args.skill.trim().length > 0 ? args.skill.trim() : "skill";
      return renderToolCall(theme, "Skill", theme.fg("accent", skillName));
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as { skill?: string } | undefined;
      const name = details?.skill ?? "skill";

      if (expanded) {
        return renderFallbackResult(result, theme.fg("accent", name));
      }

      return new Text(
        `${theme.fg("toolTitle", theme.bold("Skill"))}: ${theme.fg("accent", name)}`,
        0,
        0,
      );
    },
  });
}
