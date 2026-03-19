import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";

import {
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
} from "../image-utils.ts";
import { conciseResult, resolveAbsolutePath } from "./runtime.ts";

export function registerViewImageTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "view_image",
    label: "view_image",
    description:
      "Read a local image file and return it as an image attachment, using the same MIME detection and resize path as Pi's built-in read tool.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Path to the image file." })),
      file_path: Type.Optional(Type.String({ description: "Alias for path." })),
      detail: Type.Optional(
        Type.String({
          description:
            "Optional detail override. The only supported value is `original`; omit this field for default resized behavior.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const rawPath = params.path ?? params.file_path;
      if (!rawPath) {
        throw new Error("path or file_path is required");
      }

      const absolutePath = resolveAbsolutePath(ctx.cwd, rawPath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new Error("view_image only supports regular files");
      }

      const mimeType = await detectSupportedImageMimeTypeFromFile(absolutePath);
      if (!mimeType) {
        throw new Error("File is not a supported image (jpg, png, gif, webp)");
      }

      const buffer = await fs.readFile(absolutePath);
      if (params.detail !== undefined && params.detail !== "original") {
        throw new Error(
          `view_image.detail only supports \`original\`; omit \`detail\` for default resized behavior, got \`${params.detail}\``,
        );
      }

      if (params.detail === "original") {
        return {
          content: [
            { type: "text", text: `Read image file [${mimeType}] (original detail)` },
            { type: "image", data: buffer.toString("base64"), mimeType },
          ],
          details: {
            filePath: absolutePath,
            mimeType,
            detail: "original",
            wasResized: false,
          },
        };
      }

      const resized = await resizeImage({
        type: "image",
        data: buffer.toString("base64"),
        mimeType,
      });
      const dimensionNote = formatDimensionNote(resized);
      let textNote = `Read image file [${resized.mimeType}]`;
      if (dimensionNote) {
        textNote += `\n${dimensionNote}`;
      }

      return {
        content: [
          { type: "text", text: textNote },
          { type: "image", data: resized.data, mimeType: resized.mimeType },
        ],
        details: {
          filePath: absolutePath,
          mimeType: resized.mimeType,
          wasResized: resized.wasResized,
          width: resized.width,
          height: resized.height,
          originalWidth: resized.originalWidth,
          originalHeight: resized.originalHeight,
        },
      };
    },
    renderCall(args) {
      return conciseResult("view_image", args.path ?? args.file_path);
    },
  });
}
