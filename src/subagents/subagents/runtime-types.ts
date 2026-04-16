import type { DurableChildRecord, LiveChildAttachment } from "./types.ts";

export type RuntimeTrackedChild = DurableChildRecord;
export type RuntimeTrackedAttachment = LiveChildAttachment;

export type RuntimeCompletionState = {
  signature?: string;
  version: number;
  consumedVersion: number;
  suppressedVersion?: number;
  activeWaitCount: number;
};

export type RuntimeUpdateState = {
  message?: string;
  version: number;
  consumedVersion: number;
  suppressedVersion?: number;
};
