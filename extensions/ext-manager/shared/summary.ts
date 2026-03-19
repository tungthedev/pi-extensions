import { readFile } from "node:fs/promises";

export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export async function readSummary(path: string): Promise<string> {
  try {
    const text = await readFile(path, "utf8");
    const trimmed = text.trimStart();

    const descriptionPatterns = [
      /registerCommand\(\s*["'`][^"'`]+["'`]\s*,\s*\{[\s\S]*?description\s*:\s*["'`]([^"'`]+)["'`]/m,
      /registerTool\(\s*\{[\s\S]*?description\s*:\s*["'`]([^"'`]+)["'`]/m,
      /description\s*:\s*["'`]([^"'`]+)["'`]/m,
    ];

    for (const pattern of descriptionPatterns) {
      const match = text.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return truncate(value);
    }

    const blockComment = trimmed.match(/^\/\*+[\s\S]*?\*\//);
    if (blockComment?.[0]) {
      const firstLine = blockComment[0]
        .split("\n")
        .map((line) =>
          line
            .replace(/^\s*\/\*+\s?/, "")
            .replace(/\*\/$/, "")
            .replace(/^\s*\*\s?/, "")
            .trim(),
        )
        .find(Boolean);
      if (firstLine) return truncate(firstLine);
    }

    const lineComment = trimmed.match(/^(?:\s*\/\/.*\n?)+/);
    if (lineComment?.[0]) {
      const firstLine = lineComment[0]
        .split("\n")
        .map((line) => line.replace(/^\s*\/\/\s?/, "").trim())
        .find(Boolean);
      if (firstLine) return truncate(firstLine);
    }

    const firstCodeLine = text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    if (firstCodeLine) return truncate(firstCodeLine);
  } catch {
    // ignore
  }

  return "No description";
}
