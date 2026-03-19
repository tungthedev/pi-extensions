export { parsePatch } from "./parser.ts";
export { seekSequence } from "./matching.ts";
export { applyPatch } from "./apply.ts";
export { ApplyPatchError, applyFailed, invalidHunk, invalidPatch } from "./types.ts";
export type {
  AddFileHunk,
  AffectedPaths,
  ApplyPatchFileChange,
  ApplyPatchArgs,
  DeleteFileHunk,
  PatchHunk,
  UpdateFileChunk,
  UpdateFileHunk,
} from "./types.ts";
