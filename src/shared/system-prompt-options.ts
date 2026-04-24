import type {
  BeforeAgentStartEvent,
  BuildSystemPromptOptions,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

type PromptOptionsEvent = Pick<BeforeAgentStartEvent, "systemPromptOptions">;
type PromptOptionsContext = Pick<ExtensionContext, "cwd">;

export function getSystemPromptOptions(
  event: PromptOptionsEvent,
): BuildSystemPromptOptions | undefined {
  return event.systemPromptOptions;
}

export function resolvePromptOptionsCwd(
  event: PromptOptionsEvent,
  ctx: PromptOptionsContext,
): string {
  return getSystemPromptOptions(event)?.cwd ?? ctx.cwd;
}

export function hasStructuredSkills(event: PromptOptionsEvent): boolean {
  return (getSystemPromptOptions(event)?.skills?.length ?? 0) > 0;
}

export function resolveStructuredCustomPrompt(
  event: PromptOptionsEvent,
): string | undefined {
  return getSystemPromptOptions(event)?.customPrompt?.trim() || undefined;
}

export function resolveStructuredContextFilePaths(event: PromptOptionsEvent): string[] {
  return getSystemPromptOptions(event)?.contextFiles?.map((file) => file.path) ?? [];
}
