import type {
  DurableChildRecord,
  RegistryEntryPayload,
  SessionEntryLike,
  SubagentEntryType,
} from "./types.ts";

import { normalizeReconstructedStatus } from "./state.ts";
import { LEGACY_SUBAGENT_ENTRY_TYPES, SUBAGENT_ENTRY_TYPES } from "./types.ts";

function isRegistryEntryType(value: unknown): value is SubagentEntryType {
  return (
    (Object.values(SUBAGENT_ENTRY_TYPES) as string[]).includes(value as string) ||
    (Object.values(LEGACY_SUBAGENT_ENTRY_TYPES) as string[]).includes(value as string)
  );
}

function isDurableChildRecord(value: unknown): value is DurableChildRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DurableChildRecord>;
  return (
    typeof record.agentId === "string" &&
    (record.transport === "rpc" || record.transport === "interactive" || record.transport == null) &&
    typeof record.cwd === "string" &&
    typeof record.status === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

function isRegistryEntryPayload(value: unknown): value is RegistryEntryPayload {
  if (!value || typeof value !== "object") return false;
  return isDurableChildRecord((value as { record?: unknown }).record);
}

export function rebuildDurableRegistry(
  entries: SessionEntryLike[],
): Map<string, DurableChildRecord> {
  const records = new Map<string, DurableChildRecord>();

  for (const entry of entries) {
    if (entry.type !== "custom") continue;
    if (!isRegistryEntryType(entry.customType)) continue;
    if (!isRegistryEntryPayload(entry.data)) continue;

    const record = entry.data.record;
    records.set(record.agentId, {
      ...record,
      transport: record.transport ?? "rpc",
      status: normalizeReconstructedStatus(record.status),
    });
  }

  return records;
}
