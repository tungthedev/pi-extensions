let systemMdPromptEnabled = false;

export function enableSystemMdPrompt(): void {
  systemMdPromptEnabled = true;
}

export function isSystemMdPromptEnabled(): boolean {
  return systemMdPromptEnabled;
}

export function setSystemMdPromptEnabledForTests(enabled: boolean): void {
  systemMdPromptEnabled = enabled;
}
