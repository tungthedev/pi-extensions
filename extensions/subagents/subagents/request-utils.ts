export function wrapInteractiveSpawnPrompt(prompt: string): string {
  const normalizedPrompt = prompt.trim();
  return [
    "You are working in an interactive delegated child session.",
    "Complete the delegated task. The user can interact with you directly at any time.",
    "When your task is complete, the session usually closes automatically unless the user has taken over interactively.",
    "If you are blocked and need the parent to answer a question, make a decision, or take an action before you can continue, call caller_ping with a short specific explanation. caller_ping exits this child session so the parent can resume it later.",
    "If you are still making progress on a longer task and want to keep the parent informed without exiting, call caller_update with a short progress update, then continue working.",
    "Your FINAL assistant message before closing or calling caller_ping should summarize what you accomplished or what you need.",
    normalizedPrompt,
  ].join("\n\n");
}
