const PUBLIC_SUBAGENT_NAME_RE = /^[a-z0-9_-]+$/;

export function validateSubagentName(name: string | undefined, fieldName = "name"): string {
  const normalized = name?.trim() ?? "";
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (!PUBLIC_SUBAGENT_NAME_RE.test(normalized)) {
    throw new Error(
      `${fieldName} must use only lowercase letters, digits, underscores, and hyphens`,
    );
  }

  return normalized;
}
