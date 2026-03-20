type MatchStrategy = (left: string, right: string) => boolean;

function exactMatch(left: string, right: string): boolean {
  return left === right;
}

function trimEndMatch(left: string, right: string): boolean {
  return left.trimEnd() === right.trimEnd();
}

function trimMatch(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function normalizePatchMatch(value: string): string {
  return value
    .trim()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

function normalizedMatch(left: string, right: string): boolean {
  return normalizePatchMatch(left) === normalizePatchMatch(right);
}

// Try the strictest match first, then progressively looser variants to tolerate
// punctuation and whitespace differences that often appear in LLM-produced patches.
const MATCH_STRATEGIES: MatchStrategy[] = [exactMatch, trimEndMatch, trimMatch, normalizedMatch];

function matchesAt(
  lines: string[],
  pattern: string[],
  startIndex: number,
  strategy: MatchStrategy,
): boolean {
  for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
    if (!strategy(lines[startIndex + patternIndex], pattern[patternIndex])) {
      return false;
    }
  }

  return true;
}

export function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | undefined {
  if (pattern.length === 0) {
    return start;
  }

  if (pattern.length > lines.length) {
    return undefined;
  }

  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;
  const searchEnd = lines.length - pattern.length;

  for (const strategy of MATCH_STRATEGIES) {
    for (let index = searchStart; index <= searchEnd; index += 1) {
      if (matchesAt(lines, pattern, index, strategy)) {
        return index;
      }
    }
  }

  return undefined;
}
