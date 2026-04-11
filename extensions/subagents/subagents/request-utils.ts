export function wrapInteractiveSpawnPrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();
  return [
    "You are working in an interactive delegated child session.",
    "Complete the delegated task. The user can interact with you directly at any time.",
    "When you are finished, call the subagent_done tool to return control to the parent session.",
    "Your FINAL assistant message before calling subagent_done should summarize what you accomplished.",
    normalizedPrompt,
  ].join("\n\n");
}
