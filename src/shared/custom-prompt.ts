const PI_PROMPT_SCAFFOLD_END_MARKER =
  "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)";

const PI_PROMPT_SUFFIX_MARKERS = [
  "\n\n# Project Context\n\n",
  "\n\nThe following skills provide specialized instructions for specific tasks.",
  "\nCurrent date: ",
];

export function extractPiPromptSuffix(basePrompt: string | undefined): string {
  const prompt = basePrompt ?? "";
  const scaffoldIndex = prompt.indexOf(PI_PROMPT_SCAFFOLD_END_MARKER);

  if (scaffoldIndex !== -1) {
    return prompt.slice(scaffoldIndex + PI_PROMPT_SCAFFOLD_END_MARKER.length);
  }

  let fallbackIndex = -1;

  for (const marker of PI_PROMPT_SUFFIX_MARKERS) {
    const markerIndex = prompt.indexOf(marker);
    if (markerIndex === -1) continue;
    if (fallbackIndex === -1 || markerIndex < fallbackIndex) {
      fallbackIndex = markerIndex;
    }
  }

  return fallbackIndex === -1 ? "" : prompt.slice(fallbackIndex);
}

export function composeCustomPromptWithPiSections(
  basePrompt: string | undefined,
  customPrompt: string | undefined,
): string | undefined {
  const promptBody = customPrompt?.trim();
  if (!promptBody) return undefined;

  return `${promptBody}${extractPiPromptSuffix(basePrompt)}`;
}
