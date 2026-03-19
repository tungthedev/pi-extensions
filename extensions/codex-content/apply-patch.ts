export { ApplyPatchError, applyPatch, parsePatch, seekSequence } from "./patch/index.ts";

export type {
  AddFileHunk,
  AffectedPaths,
  ApplyPatchFileChange,
  ApplyPatchArgs,
  DeleteFileHunk,
  PatchHunk,
  UpdateFileChunk,
  UpdateFileHunk,
} from "./patch/index.ts";
