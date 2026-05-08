import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";

import { renderFallbackResult } from "../shared/renderers/common.js";
import { buildHiddenCollapsedRenderer, buildSelfShellRenderer } from "../shared/renderers/tool-renderers.js";
import { resolveSkillContent } from "./resolve.js";

const SKILL_DESCRIPTION = `Load and apply a skill by name.

Looks up the named skill in Pi's loaded skill registry and returns its instructions for the agent to follow.`;

export default function registerSkillExtension(pi: ExtensionAPI): void {
  const skillBaseRenderer = buildHiddenCollapsedRenderer({
    title: "Skill",
    getDetail: (args) =>
      typeof args.name === "string" && args.name.trim().length > 0 ? args.name.trim() : "skill",
    nativeRenderResult: (result) => renderFallbackResult(result as never),
  });
  const skillRenderer = buildSelfShellRenderer({
    stateKey: "skillRenderState",
    renderCall: skillBaseRenderer.renderCall,
    renderResult: skillBaseRenderer.renderResult,
  });

  pi.registerTool({
    name: "skill",
    label: "skill",
    description: SKILL_DESCRIPTION,
    renderShell: "self",
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
    renderCall(args, theme, context) {
      return skillRenderer.renderCall(args as Record<string, unknown>, theme, context as never);
    },
    renderResult(result, options, theme, context) {
      return skillRenderer.renderResult(result, options, theme, context as never);
    },
  });
}
