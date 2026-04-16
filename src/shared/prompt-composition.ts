export type PromptContribution =
  | { mode: "none" }
  | { mode: "skip" }
  | { mode: "append"; prompt: string }
  | { mode: "replace"; prompt: string };

function normalizePrompt(prompt: string | undefined): string | undefined {
  const normalized = prompt?.trim();
  return normalized ? normalized : undefined;
}

export function nonePromptContribution(): PromptContribution {
  return { mode: "none" };
}

export function appendPromptContribution(prompt: string | undefined): PromptContribution {
  const normalized = normalizePrompt(prompt);
  return normalized ? { mode: "append", prompt: normalized } : nonePromptContribution();
}

export function replacePromptContribution(prompt: string | undefined): PromptContribution {
  const normalized = normalizePrompt(prompt);
  return normalized ? { mode: "replace", prompt: normalized } : nonePromptContribution();
}

export function resolvePromptContribution(
  contributions: PromptContribution[],
): PromptContribution {
  const appendedPrompts: string[] = [];

  for (const contribution of contributions) {
    if (contribution.mode === "skip") return contribution;
    if (contribution.mode === "replace") return contribution;
    if (contribution.mode === "append") {
      appendedPrompts.push(contribution.prompt);
    }
  }

  return appendedPrompts.length > 0
    ? { mode: "append", prompt: appendedPrompts.join("\n\n") }
    : nonePromptContribution();
}

export function composePrompt(
  currentPrompt: string | undefined,
  contribution: PromptContribution,
): string | undefined {
  if (contribution.mode === "replace") {
    return contribution.prompt;
  }

  if (contribution.mode === "append") {
    return [normalizePrompt(currentPrompt), contribution.prompt].filter(Boolean).join("\n\n") || undefined;
  }

  return undefined;
}

export function buildPromptResult(
  currentPrompt: string | undefined,
  contribution: PromptContribution,
): { systemPrompt: string } | undefined {
  const systemPrompt = composePrompt(currentPrompt, contribution);
  return systemPrompt ? { systemPrompt } : undefined;
}
