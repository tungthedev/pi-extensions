export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const DEFAULT_MODEL_HINT = "Leave blank to use the role/default inherited model.";
export const MANUAL_MODEL_HINT = "Manual entries must use provider/model.";

export type ModelOption = {
  provider: string;
  id: string;
  fullId: string;
};

export function toModelOptions(models: Array<{ provider: string; id: string }> | undefined): ModelOption[] {
  return (models ?? []).map((model) => ({
    provider: model.provider,
    id: model.id,
    fullId: `${model.provider}/${model.id}`,
  }));
}

export function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    `${option.fullId} ${option.provider} ${option.id}`.toLowerCase().includes(needle),
  );
}

export function getVisibleModelOptions(
  options: ModelOption[],
  cursor: number,
  viewport: number,
): ModelOption[] {
  if (viewport <= 0) return [];
  const safeCursor = Math.max(0, Math.min(cursor, Math.max(0, options.length - 1)));
  const start = Math.max(0, Math.min(safeCursor - Math.floor(viewport / 2), Math.max(0, options.length - viewport)));
  return options.slice(start, start + viewport);
}

export function validateManualModelInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^[^\s/]+\/[^\s/]+$/.test(trimmed)
    ? undefined
    : "Model must be provider-qualified in the form provider/model.";
}
