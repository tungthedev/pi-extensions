import { captureContextSlice, extractMermaidBlocks, extractText } from "./extract.ts";
import { hashCode } from "./render.ts";

export type DiagramEntry = {
  id: string;
  block: {
    code: string;
    blockIndex: number;
    startLine: number;
    endLine: number;
  };
  context: { beforeLines: string[]; afterLines: string[] };
  source: "assistant" | "user" | "command";
};

type SessionMessageLike = {
  role?: unknown;
  content?: unknown;
  customType?: unknown;
  details?: unknown;
};

type SessionEntryLike = {
  id?: unknown;
  type?: unknown;
  customType?: unknown;
  data?: unknown;
  message?: SessionMessageLike;
};

const CUSTOM_TYPE = "mermaid-inline";

function readStoredDiagram(details: unknown): DiagramEntry | undefined {
  if (!details || typeof details !== "object") return undefined;
  const entry = details as Partial<DiagramEntry>;
  if (!entry.id || !entry.block?.code || !entry.source) return undefined;
  return entry as DiagramEntry;
}

function diagramSignature(entry: DiagramEntry): string {
  return `${entry.source}:${hashCode(entry.block.code)}`;
}

function pushUnique(entries: DiagramEntry[], entry: DiagramEntry, seen: Set<string>): void {
  const signature = diagramSignature(entry);
  if (seen.has(signature)) return;
  seen.add(signature);
  entries.push(entry);
}

function deriveFromMessageEntry(
  entry: SessionEntryLike,
  maxCodeLength: number,
): DiagramEntry[] {
  const message = entry.message;
  const role = message?.role;
  if (role !== "assistant" && role !== "user") {
    return [];
  }

  if (message?.customType === CUSTOM_TYPE) {
    const stored = readStoredDiagram(message.details);
    return stored ? [stored] : [];
  }

  const text = extractText(message?.content);
  if (!text) return [];

  return extractMermaidBlocks(text)
    .filter((block) => block.code.length <= maxCodeLength)
    .map((block) => ({
      id: `${String(entry.id ?? Date.now())}:${block.blockIndex}:${hashCode(block.code)}`,
      block,
      context: captureContextSlice(text, block, 5),
      source: role,
    }));
}

function deriveFromCustomEntry(entry: SessionEntryLike): DiagramEntry[] {
  if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE) {
    return [];
  }

  const stored = readStoredDiagram((entry.data as { details?: unknown } | undefined)?.details ?? entry.data);
  return stored ? [stored] : [];
}

export function indexSessionDiagrams(
  entries: SessionEntryLike[],
  options: { maxCodeLength?: number } = {},
): DiagramEntry[] {
  const maxCodeLength = options.maxCodeLength ?? 20_000;
  const diagrams: DiagramEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const stored of deriveFromCustomEntry(entry)) {
      pushUnique(diagrams, stored, seen);
    }
  }

  for (const entry of entries) {
    if (entry.type === "message") {
      for (const diagram of deriveFromMessageEntry(entry, maxCodeLength)) {
        pushUnique(diagrams, diagram, seen);
      }
    }
  }

  return diagrams;
}
