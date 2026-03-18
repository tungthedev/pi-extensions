import { open } from "node:fs/promises";

import { fileTypeFromBuffer } from "file-type";

import { getExifOrientation } from "./exif.ts";
import { loadPhoton, type PhotonImageModule } from "./photon.ts";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const FILE_TYPE_SNIFF_BYTES = 4100;
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;
const DEFAULT_OPTIONS = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: DEFAULT_MAX_BYTES,
  jpegQuality: 80,
};

type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

type ResizeableImage = {
  type: "image";
  data: string;
  mimeType: string;
};

type ResizeOptions = Partial<typeof DEFAULT_OPTIONS>;

export type ResizeImageResult = {
  data: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  wasResized: boolean;
};

function rotate90(
  photon: PhotonImageModule,
  image: InstanceType<PhotonImageModule["PhotonImage"]>,
  dstIndex: (x: number, y: number, w: number, h: number) => number,
): InstanceType<PhotonImageModule["PhotonImage"]> {
  const w = image.get_width();
  const h = image.get_height();
  const src = image.get_raw_pixels();
  const dst = new Uint8Array(src.length);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const srcIdx = (y * w + x) * 4;
      const dstIdx = dstIndex(x, y, w, h) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }

  return new photon.PhotonImage(dst, h, w);
}

function applyExifOrientation(
  photon: PhotonImageModule,
  image: InstanceType<PhotonImageModule["PhotonImage"]>,
  originalBytes: Uint8Array,
): InstanceType<PhotonImageModule["PhotonImage"]> {
  const orientation = getExifOrientation(originalBytes);
  if (orientation === 1) return image;

  switch (orientation) {
    case 2:
      photon.fliph(image);
      return image;
    case 3:
      photon.fliph(image);
      photon.flipv(image);
      return image;
    case 4:
      photon.flipv(image);
      return image;
    case 5: {
      const rotated = rotate90(photon, image, (x, y, _w, h) => x * h + (h - 1 - y));
      photon.fliph(rotated);
      return rotated;
    }
    case 6:
      return rotate90(photon, image, (x, y, _w, h) => x * h + (h - 1 - y));
    case 7: {
      const rotated = rotate90(photon, image, (x, y, w, h) => (w - 1 - x) * h + y);
      photon.fliph(rotated);
      return rotated;
    }
    case 8:
      return rotate90(photon, image, (x, y, w, h) => (w - 1 - x) * h + y);
    default:
      return image;
  }
}

function pickSmaller(
  a: { buffer: Uint8Array; mimeType: string },
  b: { buffer: Uint8Array; mimeType: string },
) {
  return a.buffer.length <= b.buffer.length ? a : b;
}

export async function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<SupportedImageMimeType | null> {
  const fileHandle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(FILE_TYPE_SNIFF_BYTES);
    const { bytesRead } = await fileHandle.read(buffer, 0, FILE_TYPE_SNIFF_BYTES, 0);
    if (bytesRead === 0) return null;

    const fileType = await fileTypeFromBuffer(buffer.subarray(0, bytesRead));
    if (!fileType || !IMAGE_MIME_TYPES.has(fileType.mime)) return null;
    return fileType.mime as SupportedImageMimeType;
  } finally {
    await fileHandle.close();
  }
}

export async function resizeImage(
  image: ResizeableImage,
  options?: ResizeOptions,
): Promise<ResizeImageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const inputBuffer = Buffer.from(image.data, "base64");
  const photon = await loadPhoton();
  if (!photon) {
    return {
      data: image.data,
      mimeType: image.mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  }
  const photonModule = photon;

  let workingImage: InstanceType<PhotonImageModule["PhotonImage"]> | undefined;

  try {
    const inputBytes = new Uint8Array(inputBuffer);
    const rawImage = photonModule.PhotonImage.new_from_byteslice(inputBytes);
    workingImage = applyExifOrientation(photonModule, rawImage, inputBytes);
    if (workingImage !== rawImage) rawImage.free();

    const originalWidth = workingImage.get_width();
    const originalHeight = workingImage.get_height();
    const format = image.mimeType.split("/")[1] ?? "png";
    const originalSize = inputBuffer.length;

    if (
      originalWidth <= opts.maxWidth &&
      originalHeight <= opts.maxHeight &&
      originalSize <= opts.maxBytes
    ) {
      return {
        data: image.data,
        mimeType: image.mimeType ?? `image/${format}`,
        originalWidth,
        originalHeight,
        width: originalWidth,
        height: originalHeight,
        wasResized: false,
      };
    }

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    if (targetWidth > opts.maxWidth) {
      targetHeight = Math.round((targetHeight * opts.maxWidth) / targetWidth);
      targetWidth = opts.maxWidth;
    }
    if (targetHeight > opts.maxHeight) {
      targetWidth = Math.round((targetWidth * opts.maxHeight) / targetHeight);
      targetHeight = opts.maxHeight;
    }

    function tryBothFormats(width: number, height: number, jpegQuality: number) {
      const resized = photonModule.resize(
        workingImage!,
        width,
        height,
        photonModule.SamplingFilter.Lanczos3,
      );
      try {
        const pngBuffer = resized.get_bytes();
        const jpegBuffer = resized.get_bytes_jpeg(jpegQuality);
        return pickSmaller(
          { buffer: pngBuffer, mimeType: "image/png" },
          { buffer: jpegBuffer, mimeType: "image/jpeg" },
        );
      } finally {
        resized.free();
      }
    }

    const qualitySteps = [85, 70, 55, 40];
    const scaleSteps = [1.0, 0.75, 0.5, 0.35, 0.25];
    let best = tryBothFormats(targetWidth, targetHeight, opts.jpegQuality);
    let finalWidth = targetWidth;
    let finalHeight = targetHeight;

    if (best.buffer.length <= opts.maxBytes) {
      return {
        data: Buffer.from(best.buffer).toString("base64"),
        mimeType: best.mimeType,
        originalWidth,
        originalHeight,
        width: finalWidth,
        height: finalHeight,
        wasResized: true,
      };
    }

    for (const quality of qualitySteps) {
      best = tryBothFormats(targetWidth, targetHeight, quality);
      if (best.buffer.length <= opts.maxBytes) {
        return {
          data: Buffer.from(best.buffer).toString("base64"),
          mimeType: best.mimeType,
          originalWidth,
          originalHeight,
          width: finalWidth,
          height: finalHeight,
          wasResized: true,
        };
      }
    }

    for (const scale of scaleSteps) {
      finalWidth = Math.round(targetWidth * scale);
      finalHeight = Math.round(targetHeight * scale);
      if (finalWidth < 100 || finalHeight < 100) break;

      for (const quality of qualitySteps) {
        best = tryBothFormats(finalWidth, finalHeight, quality);
        if (best.buffer.length <= opts.maxBytes) {
          return {
            data: Buffer.from(best.buffer).toString("base64"),
            mimeType: best.mimeType,
            originalWidth,
            originalHeight,
            width: finalWidth,
            height: finalHeight,
            wasResized: true,
          };
        }
      }
    }

    return {
      data: Buffer.from(best.buffer).toString("base64"),
      mimeType: best.mimeType,
      originalWidth,
      originalHeight,
      width: finalWidth,
      height: finalHeight,
      wasResized: true,
    };
  } catch {
    return {
      data: image.data,
      mimeType: image.mimeType,
      originalWidth: 0,
      originalHeight: 0,
      width: 0,
      height: 0,
      wasResized: false,
    };
  } finally {
    workingImage?.free();
  }
}

export function formatDimensionNote(result: ResizeImageResult): string | undefined {
  if (!result.wasResized) return undefined;
  const scale = result.originalWidth / result.width;
  return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
