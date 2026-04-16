import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";

const SHIFT_ENTER_SEQUENCES = new Set(["\u001b[13;2u", "\u001b[13;2~", "\u001b[27;2;13~"]);
const DOLLAR_SKILL_PREFIX_PATTERN = /(?:^|[\s])(\$[a-zA-Z0-9._-]*)$/;

type AutocompleteKeybindings = Pick<KeybindingsManager, "matches">;
type ForceableAutocompleteProvider = AutocompleteProvider & {
  getForceFileSuggestions?: (lines: string[], cursorLine: number, cursorCol: number) => {
    items: AutocompleteItem[];
    prefix: string;
  } | null;
  shouldTriggerFileCompletion?: (lines: string[], cursorLine: number, cursorCol: number) => boolean;
};

export function normalizeCodexEditorInput(data: string): string {
  if (data === "\n") return "\u001b[13;2u";
  return SHIFT_ENTER_SEQUENCES.has(data) ? "\u001b[13;2u" : data;
}

export function getDollarSkillPrefix(textBeforeCursor: string): string | undefined {
  return textBeforeCursor.match(DOLLAR_SKILL_PREFIX_PATTERN)?.[1];
}

export function shouldTriggerDollarSkillAutocomplete(
  data: string,
  textBeforeCursor: string,
  keybindings: AutocompleteKeybindings,
): boolean {
  if (!getDollarSkillPrefix(textBeforeCursor)) return false;
  if (data === "$") return true;
  if (/^[a-zA-Z0-9._-]$/.test(data)) return true;

  return (
    keybindings.matches(data, "tui.editor.deleteCharBackward") ||
    keybindings.matches(data, "tui.editor.deleteCharForward")
  );
}

function applyDollarSkillCompletion(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  item: AutocompleteItem,
  prefix: string,
): { lines: string[]; cursorLine: number; cursorCol: number } {
  const currentLine = lines[cursorLine] ?? "";
  const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
  const afterCursor = currentLine.slice(cursorCol);
  const newLine = `${beforePrefix}/${item.value} ${afterCursor}`;
  const newLines = [...lines];
  newLines[cursorLine] = newLine;

  return {
    lines: newLines,
    cursorLine,
    cursorCol: beforePrefix.length + item.value.length + 2,
  };
}

export function wrapAutocompleteProviderWithDollarSkillSupport(
  provider: AutocompleteProvider,
): ForceableAutocompleteProvider {
  const baseProvider = provider as ForceableAutocompleteProvider;
  const getSkillSuggestions = async (
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: Parameters<AutocompleteProvider["getSuggestions"]>[3],
  ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> => {
    const currentLine = lines[cursorLine] ?? "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    const dollarSkillPrefix = getDollarSkillPrefix(textBeforeCursor);

    if (!dollarSkillPrefix) return null;

    const syntheticPrefix = `/skill:${dollarSkillPrefix.slice(1)}`;
    const suggestions = await baseProvider.getSuggestions(
      [syntheticPrefix],
      0,
      syntheticPrefix.length,
      options,
    );
    if (!suggestions) return null;

    return {
      ...suggestions,
      prefix: dollarSkillPrefix,
    };
  };

  return {
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      return (
        (await getSkillSuggestions(lines, cursorLine, cursorCol, options)) ??
        baseProvider.getSuggestions(lines, cursorLine, cursorCol, options)
      );
    },
    getForceFileSuggestions(lines, cursorLine, cursorCol) {
      return baseProvider.getForceFileSuggestions?.(lines, cursorLine, cursorCol) ?? null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (prefix.startsWith("$") && item.value.startsWith("skill:")) {
        return applyDollarSkillCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      return baseProvider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      if (getDollarSkillPrefix(textBeforeCursor)) return true;

      return baseProvider.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}
