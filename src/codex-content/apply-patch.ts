export { ApplyPatchError, applyPatch, parsePatch, seekSequence } from "./patch/index.js";

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
} from "./patch/index.js";
