export type ApplyPatchErrorCode = "invalid_patch" | "invalid_hunk" | "apply_failed";

export class ApplyPatchError extends Error {
  code: ApplyPatchErrorCode;
  lineNumber?: number;

  constructor(code: ApplyPatchErrorCode, message: string, lineNumber?: number) {
    super(message);
    this.name = "ApplyPatchError";
    this.code = code;
    this.lineNumber = lineNumber;
  }
}

export type AddFileHunk = {
  type: "add";
  path: string;
  contents: string;
};

export type DeleteFileHunk = {
  type: "delete";
  path: string;
};

export type UpdateFileChunk = {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
};

export type UpdateFileHunk = {
  type: "update";
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
};

export type PatchHunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

export type ApplyPatchArgs = {
  patch: string;
  hunks: PatchHunk[];
};

export type AffectedPaths = {
  added: string[];
  modified: string[];
  deleted: string[];
};

export type ApplyPatchFileChangeAction = "added" | "modified" | "deleted" | "moved";

export type ApplyPatchFileChange = {
  action: ApplyPatchFileChangeAction;
  path: string;
  sourcePath?: string;
  diff?: string;
};

export type VirtualFileState = {
  path: string;
  initialExists: boolean;
  initialContent?: string;
  finalExists: boolean;
  finalContent?: string;
  bom?: string;
  lineEnding?: "\n" | "\r\n";
  isBinary?: boolean;
  initialBinaryContent?: Buffer;
  finalBinaryContent?: Buffer;
};

export type TouchedPaths = {
  added: string[];
  modified: string[];
  deleted: string[];
};

export function invalidPatch(message: string): never {
  throw new ApplyPatchError("invalid_patch", `Invalid patch: ${message}`);
}

export function invalidHunk(lineNumber: number, message: string): never {
  throw new ApplyPatchError(
    "invalid_hunk",
    `Invalid patch hunk on line ${lineNumber}: ${message}`,
    lineNumber,
  );
}

export function applyFailed(message: string): never {
  throw new ApplyPatchError("apply_failed", message);
}
