import { randomInt } from "node:crypto";

import type { DurableChildRecord } from "./types.ts";

const SUBAGENT_NAME_ADJECTIVES = [
  "amber",
  "brisk",
  "calm",
  "cinder",
  "clear",
  "cobalt",
  "ember",
  "fern",
  "golden",
  "granite",
  "harbor",
  "indigo",
  "ivory",
  "jade",
  "lunar",
  "maple",
  "mist",
  "nova",
  "onyx",
  "quiet",
  "river",
  "silver",
  "solar",
  "swift",
  "topaz",
  "velvet",
  "wild",
  "willow",
] as const;

const SUBAGENT_NAME_NOUNS = [
  "badger",
  "comet",
  "crane",
  "ember",
  "falcon",
  "fjord",
  "fox",
  "gecko",
  "harbor",
  "hawk",
  "heron",
  "kite",
  "lynx",
  "meadow",
  "otter",
  "owl",
  "panda",
  "pine",
  "raven",
  "ridge",
  "rook",
  "sparrow",
  "summit",
  "thrush",
  "tiger",
  "vale",
  "wolf",
  "wren",
] as const;

const SUBAGENT_NAME_POOL = SUBAGENT_NAME_ADJECTIVES.flatMap((adjective) =>
  SUBAGENT_NAME_NOUNS.map((noun) => `${adjective}-${noun}`),
);

export function generateUniqueSubagentName(
  usedNames: Iterable<string>,
  pickIndex: (maxExclusive: number) => number = randomInt,
): string {
  const used = new Set([...usedNames].map((name) => name.trim().toLowerCase()).filter(Boolean));

  const start = SUBAGENT_NAME_POOL.length > 0 ? pickIndex(SUBAGENT_NAME_POOL.length) : 0;

  for (let offset = 0; offset < SUBAGENT_NAME_POOL.length; offset += 1) {
    const candidate = SUBAGENT_NAME_POOL[(start + offset) % SUBAGENT_NAME_POOL.length]!;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  const base = SUBAGENT_NAME_POOL[start] ?? "subagent";
  let suffix = 2;
  while (used.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function seededIndex(seed: string): (maxExclusive: number) => number {
  const hash = hashString(seed);
  return (maxExclusive: number) => (maxExclusive > 0 ? hash % maxExclusive : 0);
}

export function resolveSubagentName(
  records: Iterable<DurableChildRecord>,
  preferredName?: string,
  seed?: string,
): string {
  const trimmedPreferredName = preferredName?.trim();
  if (trimmedPreferredName) {
    return trimmedPreferredName;
  }

  return generateUniqueSubagentName(
    [...records]
      .map((record) => record.name)
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0),
    seed ? seededIndex(seed) : randomInt,
  );
}
