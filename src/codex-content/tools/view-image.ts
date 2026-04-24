import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { Type } from "typebox";
import fs from "node:fs/promises";

import {
  detectSupportedImageMimeTypeFromFile,
  formatDimensionNote,
  resizeImage,
} from "../image-utils.ts";
import { renderToolCall } from "../renderers/common.ts";
import { shortenPath } from "../shared/text.ts";
import { resolveAbsolutePath } from "./runtime.ts";

type ViewImageDetail = "original" | undefined;

function resolveRequestedImagePath(params: { path?: string; file_path?: string }): string {
  const rawPath = params.path ?? params.file_path;
  if (!rawPath) {
    throw new Error("path or file_path is required");
  }

  return rawPath;
}

function normalizeDetail(detail: string | undefined): ViewImageDetail {
  if (detail === undefined || detail === "original") {
    return detail;
  }

  throw new Error(
    `view_image.detail only supports \`original\`; omit \`detail\` for default resized behavior, got \`${detail}\``,
  );
}

function buildOriginalImageResult(
  filePath: string,
  mimeType: string,
  imageData: string,
): AgentToolResult<Record<string, unknown>> {
  return {
    content: [
      { type: "text" as const, text: `Read image file [${mimeType}] (original detail)` },
      { type: "image" as const, data: imageData, mimeType },
    ],
    details: {
      filePath,
      mimeType,
      detail: "original",
      wasResized: false,
    },
  };
}

function buildResizedImageResult(
  filePath: string,
  resized: {
    data: string;
    mimeType: string;
    wasResized: boolean;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
  },
): AgentToolResult<Record<string, unknown>> {
  const dimensionNote = formatDimensionNote(resized);
  let textNote = `Read image file [${resized.mimeType}]`;
  if (dimensionNote) {
    textNote += `\n${dimensionNote}`;
  }

  return {
    content: [
      { type: "text" as const, text: textNote },
      { type: "image" as const, data: resized.data, mimeType: resized.mimeType },
    ],
    details: {
      filePath,
      mimeType: resized.mimeType,
      wasResized: resized.wasResized,
      width: resized.width,
      height: resized.height,
      originalWidth: resized.originalWidth,
      originalHeight: resized.originalHeight,
    },
  };
}

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
      const rawPath = resolveRequestedImagePath(params);
      const detail = normalizeDetail(params.detail);
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
      const imageData = buffer.toString("base64");
      if (detail === "original") {
        return buildOriginalImageResult(absolutePath, mimeType, imageData);
      }

      const resized = await resizeImage({
        type: "image",
        data: imageData,
        mimeType,
      });
      return buildResizedImageResult(absolutePath, resized);
    },
    renderCall(args, theme) {
      const path = shortenPath(args.path ?? args.file_path);
      const detail = args.detail === "original" ? theme.fg("dim", " (original)") : undefined;
      return renderToolCall(
        theme,
        "View image",
        `${theme.fg("accent", path)}${detail ?? ""}`,
      );
    },
  });
}
