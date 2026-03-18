const exactMatch = (left: string, right: string) => left === right;
const rstripMatch = (left: string, right: string) => left.trimEnd() === right.trimEnd();
const trimMatch = (left: string, right: string) => left.trim() === right.trim();

const normalizePatchMatch = (value: string) =>
  value
    .trim()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");

const normalizedMatch = (left: string, right: string) =>
  normalizePatchMatch(left) === normalizePatchMatch(right);

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
  const comparators = [exactMatch, rstripMatch, trimMatch, normalizedMatch];

  for (const compare of comparators) {
    for (let index = searchStart; index <= searchEnd; index += 1) {
      let ok = true;
      for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
        if (!compare(lines[index + patternIndex], pattern[patternIndex])) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return index;
      }
    }
  }

  return undefined;
}
