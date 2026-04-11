function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeArrayItems(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
    .filter(Boolean);
}

export function matchTomlString(contents: string, key: string): string | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1]?.trim();
}

export function matchTomlTripleQuotedString(
  contents: string,
  key: string,
): string | undefined {
  const match = contents.match(
    new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"""([\\s\\S]*?)"""`, "m"),
  );
  return match?.[1]?.trim();
}

export function matchTomlStringArray(contents: string, key: string): string[] | undefined {
  const match = contents.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, "m"));
  if (!match?.[1]) return undefined;
  const values = normalizeArrayItems(match[1]);
  return values.length > 0 ? values : undefined;
}

export function listTomlNamedTableSections(
  contents: string,
  tablePrefix: string,
): Array<{ name: string; body: string }> {
  const headerRegex = new RegExp(`^\\[${escapeRegExp(tablePrefix)}\\.([^\\]]+)\\]\\s*$`, "gm");
  const anyHeaderRegex = /^\[[^\]]+\]\s*$/gm;
  const matches = [...contents.matchAll(headerRegex)];
  const allHeaders = [...contents.matchAll(anyHeaderRegex)];

  return matches
    .map((match) => {
      const name = match[1]?.trim();
      if (!name) return undefined;

      const sectionStart = (match.index ?? 0) + match[0].length;
      const sectionEnd =
        allHeaders.find((header) => (header.index ?? 0) > (match.index ?? 0))?.index ??
        contents.length;

      return {
        name,
        body: contents.slice(sectionStart, sectionEnd),
      };
    })
    .filter((section): section is { name: string; body: string } => Boolean(section));
}
