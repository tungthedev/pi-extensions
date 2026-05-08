export { applyPatch } from "./apply.js";
export { ApplyPatchError, applyFailed, invalidHunk, invalidPatch } from "./types.js";
export { seekSequence } from "./matching.js";
export { parsePatch } from "./parser.js";
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
} from "./types.js";
