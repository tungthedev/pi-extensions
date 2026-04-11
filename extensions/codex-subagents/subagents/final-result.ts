export function resolveFinalResultText(options: {
  eventText?: string;
  cachedText?: string;
}): string | undefined {
  const eventText = options.eventText?.trim();
  if (eventText) return eventText;

  const cachedText = options.cachedText?.trim();
  return cachedText || undefined;
}
