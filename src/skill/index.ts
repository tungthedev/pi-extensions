import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Container } from "@mariozechner/pi-tui";
import { Type } from "typebox";

import { renderToolCall } from "../shared/renderers/common.ts";
import { applyResolvedToolset } from "../shared/toolset-resolver.ts";
import { resolveSkillContent } from "./resolve.ts";

const SKILL_DESCRIPTION = `Load and apply a skill by name.

Looks up the named skill in Pi's loaded skill registry and returns its instructions for the agent to follow.`;

async function syncSkillToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerSkillExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    await syncSkillToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await syncSkillToolSet(pi, ctx);
  });

  pi.registerTool({
    name: "skill",
    label: "skill",
    description: SKILL_DESCRIPTION,
    parameters: Type.Object({
      name: Type.String({
        description: "The name of the skill to load and apply.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const trimmedName = params.name.trim();
      const { content, skillDir } = await resolveSkillContent(trimmedName, {
        commands: pi.getCommands(),
      });
      return {
        content: [{ type: "text" as const, text: content }],
        details: {
          name: trimmedName,
          skill_dir: skillDir,
        },
      };
    },
    renderCall(args, theme) {
      const skillName = typeof args.name === "string" && args.name.trim().length > 0 ? args.name.trim() : "skill";
      return renderToolCall(theme, "[skill]", theme.fg("accent", skillName));
    },
    renderResult() {
      return new Container();
    },
  });
}
