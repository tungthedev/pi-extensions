// Compatibility alias for callers that import image helpers from the top-level codex-content surface.
export {
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
} from "./images/index.ts";

export type { ResizeImageResult } from "./images/index.ts";
