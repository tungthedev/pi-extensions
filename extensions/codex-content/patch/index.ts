export { applyPatch } from "./apply.ts";
export { ApplyPatchError, applyFailed, invalidHunk, invalidPatch } from "./types.ts";
export { seekSequence } from "./matching.ts";
export { parsePatch } from "./parser.ts";
export type {
  AddFileHunk,
  AffectedPaths,
  ApplyPatchFileChange,
  ApplyPatchFileChangeAction,
  ApplyPatchArgs,
  ApplyPatchErrorCode,
  DeleteFileHunk,
  PatchHunk,
  UpdateFileChunk,
  UpdateFileHunk,
} from "./types.ts";
