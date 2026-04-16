export { ApplyPatchError, applyPatch, parsePatch, seekSequence } from "./patch/index.ts";

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
} from "./patch/index.ts";
