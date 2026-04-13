import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@mariozechner/pi-tui";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";

import type { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import type { AppResult } from "../result-utils.ts";
import type { FffFileCandidate } from "../types.ts";

const PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);
const MAX_RESULTS = 20;

type TrackableAutocompleteProvider = AutocompleteProvider & {
  getForceFileSuggestions?: (
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ) => {
    items: AutocompleteItem[];
    prefix: string;
  } | null;
  shouldTriggerFileCompletion?: (lines: string[], cursorLine: number, cursorCol: number) => boolean;
};

export type PathAutocompleteRuntime = {
  searchFileCandidates: (
    query: string,
    limit?: number,
  ) => Promise<AppResult<FffFileCandidate[], RuntimeInitializationError | FinderOperationError>>;
  trackQuery: (
    query: string,
    selectedPath: string,
  ) => Promise<AppResult<void, RuntimeInitializationError | FinderOperationError>>;
  warm?: (
    timeoutMs?: number,
  ) => Promise<
    AppResult<
      { ready: boolean; indexedFiles?: number; error?: string },
      RuntimeInitializationError | FinderOperationError
    >
  >;
};

type AutocompleteKeybindings = Pick<
  KeybindingsManager,
  "matches"
>;

function findLastDelimiter(text: string): number {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (PATH_DELIMITERS.has(text[index] ?? "")) return index;
  }
  return -1;
}

function isTokenStart(text: string, index: number): boolean {
  return index === 0 || PATH_DELIMITERS.has(text[index - 1] ?? "");
}

function findUnclosedQuoteStart(text: string): number | null {
  let inQuotes = false;
  let quoteStart = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      inQuotes = !inQuotes;
      if (inQuotes) quoteStart = index;
    }
  }
  return inQuotes ? quoteStart : null;
}

export function extractAtPathPrefix(text: string): string | null {
  const quoteStart = findUnclosedQuoteStart(text);
  if (
    quoteStart !== null &&
    quoteStart > 0 &&
    text[quoteStart - 1] === "@" &&
    isTokenStart(text, quoteStart - 1)
  ) {
    return text.slice(quoteStart - 1);
  }

  const lastDelimiterIndex = findLastDelimiter(text);
  const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
  if (text[tokenStart] === "@") return text.slice(tokenStart);
  return null;
}

function parseAtPrefix(prefix: string): { rawQuery: string; isQuotedPrefix: boolean } {
  if (prefix.startsWith('@"')) return { rawQuery: prefix.slice(2), isQuotedPrefix: true };
  return { rawQuery: prefix.slice(1), isQuotedPrefix: false };
}

export function shouldTriggerAtPathAutocomplete(
  data: string,
  textBeforeCursor: string,
  keybindings: AutocompleteKeybindings,
): boolean {
  if (!extractAtPathPrefix(textBeforeCursor)) return false;
  if (data === "@") return true;
  if (/^[a-zA-Z0-9._\-/]$/.test(data)) return true;

  return (
    keybindings.matches(data, "tui.editor.deleteCharBackward") ||
    keybindings.matches(data, "tui.editor.deleteCharForward")
  );
}

async function loadPathCandidates(
  runtime: PathAutocompleteRuntime,
  rawQuery: string,
  signal: AbortSignal,
): Promise<AppResult<FffFileCandidate[], RuntimeInitializationError | FinderOperationError>> {
  let result = await runtime.searchFileCandidates(rawQuery, MAX_RESULTS);
  if (signal.aborted) return result;
  if (result.isErr() || result.value.length > 0 || !rawQuery.trim() || !runtime.warm) {
    return result;
  }

  await runtime.warm(750);
  if (signal.aborted) return result;
  result = await runtime.searchFileCandidates(rawQuery, MAX_RESULTS);
  return result;
}

function normalizeInsertedPath(value: string): string {
  let normalized = value.trim();
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized.startsWith('"') && normalized.endsWith('"') && normalized.length >= 2) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function toSuggestion(
  relativePath: string,
  label: string,
  description: string,
  isQuotedPrefix: boolean,
): AutocompleteItem {
  const filePath = relativePath.replace(/\\/g, "/");
  const needsQuotes = isQuotedPrefix || filePath.includes(" ");
  return {
    value: needsQuotes ? `@"${filePath}"` : `@${filePath}`,
    label,
    description,
  };
}

export function wrapAutocompleteProviderWithAtPathSupport(
  provider: AutocompleteProvider,
  runtime: PathAutocompleteRuntime,
): TrackableAutocompleteProvider {
  const baseProvider = provider as TrackableAutocompleteProvider;

  return {
    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options: { signal: AbortSignal; force?: boolean },
    ): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const atPrefix = extractAtPathPrefix(textBeforeCursor);
      if (!atPrefix)
        return await baseProvider.getSuggestions(lines, cursorLine, cursorCol, options);
      if (options.signal.aborted) return null;

      const { rawQuery, isQuotedPrefix } = parseAtPrefix(atPrefix);
      const candidatesResult = await loadPathCandidates(runtime, rawQuery, options.signal);
      if (
        options.signal.aborted ||
        candidatesResult.isErr() ||
        candidatesResult.value.length === 0
      ) {
        return await baseProvider.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: atPrefix,
        items: candidatesResult.value.map((candidate) => {
          const matchType = candidate.score?.matchType ? ` · ${candidate.score.matchType}` : "";
          return toSuggestion(
            candidate.item.relativePath,
            candidate.item.fileName || candidate.item.relativePath,
            `${candidate.item.relativePath}${matchType}`,
            isQuotedPrefix,
          );
        }),
      };
    },
    getForceFileSuggestions(lines, cursorLine, cursorCol) {
      return baseProvider.getForceFileSuggestions?.(lines, cursorLine, cursorCol) ?? null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      void runtime.trackQuery(prefix, normalizeInsertedPath(item.value));
      return baseProvider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return baseProvider.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}
