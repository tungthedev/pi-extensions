import type { DurableChildRecord, LiveChildAttachment } from "./types.ts";

export function createAttachmentRegistry() {
  const durableChildrenById = new Map<string, DurableChildRecord>();
  const liveAttachmentsById = new Map<string, LiveChildAttachment>();

  return {
    durableChildrenById,
    liveAttachmentsById,
    getDurable(agentId: string) {
      return durableChildrenById.get(agentId);
    },
    hasDurable(agentId: string) {
      return durableChildrenById.has(agentId);
    },
    setDurable(agentId: string, record: DurableChildRecord) {
      durableChildrenById.set(agentId, record);
    },
    attach(record: DurableChildRecord, attachment?: LiveChildAttachment) {
      durableChildrenById.set(record.agentId, record);
      if (attachment) {
        liveAttachmentsById.set(record.agentId, attachment);
      }
    },
    deleteDurable(agentId: string) {
      durableChildrenById.delete(agentId);
    },
    replaceDurable(records: Map<string, DurableChildRecord>) {
      durableChildrenById.clear();
      for (const [agentId, record] of records) {
        durableChildrenById.set(agentId, record);
      }
    },
    durableValues() {
      return durableChildrenById.values();
    },
    getLive(agentId: string) {
      return liveAttachmentsById.get(agentId);
    },
    setLive(agentId: string, attachment: LiveChildAttachment) {
      liveAttachmentsById.set(agentId, attachment);
    },
    deleteLive(agentId: string) {
      liveAttachmentsById.delete(agentId);
    },
    listLive() {
      return [...liveAttachmentsById.values()];
    },
  };
}
