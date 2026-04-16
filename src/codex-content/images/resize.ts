import { fileTypeFromBuffer } from "file-type";
import { open } from "node:fs/promises";

import { getExifOrientation } from "./exif.ts";
import { loadPhoton, type PhotonImageModule } from "./photon.ts";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const FILE_TYPE_SNIFF_BYTES = 4100;
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;
const QUALITY_STEPS = [85, 70, 55, 40] as const;
const SCALE_STEPS = [0.75, 0.5, 0.35, 0.25] as const;
const MIN_OUTPUT_DIMENSION = 100;

const DEFAULT_OPTIONS = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: DEFAULT_MAX_BYTES,
  jpegQuality: 80,
};

type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
type PhotonImage = InstanceType<PhotonImageModule["PhotonImage"]>;

type ResizableImage = {
  type: "image";
  data: string;
  mimeType: string;
};

type ResizeOptions = Partial<typeof DEFAULT_OPTIONS>;

type EncodedImage = {
  buffer: Uint8Array;
  mimeType: string;
};

type ResizeAttempt = {
  encoded: EncodedImage;
  width: number;
  height: number;
};

type Dimensions = {
  width: number;
  height: number;
};

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
  image: PhotonImage,
  dstIndex: (x: number, y: number, w: number, h: number) => number,
): PhotonImage {
  const width = image.get_width();
  const height = image.get_height();
  const sourcePixels = image.get_raw_pixels();
  const destinationPixels = new Uint8Array(sourcePixels.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * 4;
      const destinationIndex = dstIndex(x, y, width, height) * 4;

      destinationPixels[destinationIndex] = sourcePixels[sourceIndex];
      destinationPixels[destinationIndex + 1] = sourcePixels[sourceIndex + 1];
      destinationPixels[destinationIndex + 2] = sourcePixels[sourceIndex + 2];
      destinationPixels[destinationIndex + 3] = sourcePixels[sourceIndex + 3];
    }
  }

  return new photon.PhotonImage(destinationPixels, height, width);
}

function rotateClockwise(photon: PhotonImageModule, image: PhotonImage): PhotonImage {
  return rotate90(photon, image, (x, y, _width, height) => x * height + (height - 1 - y));
}

function rotateCounterClockwise(photon: PhotonImageModule, image: PhotonImage): PhotonImage {
  return rotate90(photon, image, (x, y, width, height) => (width - 1 - x) * height + y);
}

function applyExifOrientation(
  photon: PhotonImageModule,
  image: PhotonImage,
  originalBytes: Uint8Array,
): PhotonImage {
  const orientation = getExifOrientation(originalBytes);
  if (orientation === 1) {
    return image;
  }

  if (orientation === 2) {
    photon.fliph(image);
    return image;
  }

  if (orientation === 3) {
    photon.fliph(image);
    photon.flipv(image);
    return image;
  }

  if (orientation === 4) {
    photon.flipv(image);
    return image;
  }

  if (orientation === 5) {
    const rotated = rotateClockwise(photon, image);
    photon.fliph(rotated);
    return rotated;
  }

  if (orientation === 6) {
    return rotateClockwise(photon, image);
  }

  if (orientation === 7) {
    const rotated = rotateCounterClockwise(photon, image);
    photon.fliph(rotated);
    return rotated;
  }

  if (orientation === 8) {
    return rotateCounterClockwise(photon, image);
  }

  return image;
}

function pickSmaller(a: EncodedImage, b: EncodedImage): EncodedImage {
  if (a.buffer.length <= b.buffer.length) {
    return a;
  }

  return b;
}

function buildFallbackResult(image: ResizableImage): ResizeImageResult {
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

function buildUnchangedResult(image: ResizableImage, dimensions: Dimensions): ResizeImageResult {
  return {
    data: image.data,
    mimeType: image.mimeType,
    originalWidth: dimensions.width,
    originalHeight: dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
    wasResized: false,
  };
}

function buildResizedResult(
  attempt: ResizeAttempt,
  originalDimensions: Dimensions,
): ResizeImageResult {
  return {
    data: Buffer.from(attempt.encoded.buffer).toString("base64"),
    mimeType: attempt.encoded.mimeType,
    originalWidth: originalDimensions.width,
    originalHeight: originalDimensions.height,
    width: attempt.width,
    height: attempt.height,
    wasResized: true,
  };
}

function buildQualitySteps(preferredQuality: number): number[] {
  return [preferredQuality, ...QUALITY_STEPS.filter((quality) => quality !== preferredQuality)];
}

function fitsWithinLimits(
  dimensions: Dimensions,
  byteLength: number,
  options: typeof DEFAULT_OPTIONS,
): boolean {
  return (
    dimensions.width <= options.maxWidth &&
    dimensions.height <= options.maxHeight &&
    byteLength <= options.maxBytes
  );
}

function clampDimensions(dimensions: Dimensions, maxWidth: number, maxHeight: number): Dimensions {
  let width = dimensions.width;
  let height = dimensions.height;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  return { width, height };
}

function scaleDimensions(dimensions: Dimensions, scale: number): Dimensions {
  return {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale),
  };
}

function isTooSmallToContinue(dimensions: Dimensions): boolean {
  return dimensions.width < MIN_OUTPUT_DIMENSION || dimensions.height < MIN_OUTPUT_DIMENSION;
}

function encodeResizedImage(
  photon: PhotonImageModule,
  image: PhotonImage,
  dimensions: Dimensions,
  jpegQuality: number,
): EncodedImage {
  const resized = photon.resize(
    image,
    dimensions.width,
    dimensions.height,
    photon.SamplingFilter.Lanczos3,
  );

  try {
    const pngImage = { buffer: resized.get_bytes(), mimeType: "image/png" };
    const jpegImage = {
      buffer: resized.get_bytes_jpeg(jpegQuality),
      mimeType: "image/jpeg",
    };
    return pickSmaller(pngImage, jpegImage);
  } finally {
    resized.free();
  }
}

function findAttemptAtDimensions(
  photon: PhotonImageModule,
  image: PhotonImage,
  dimensions: Dimensions,
  qualities: number[],
  maxBytes: number,
): { accepted?: ResizeAttempt; best: ResizeAttempt } {
  let best: ResizeAttempt | undefined;

  for (const quality of qualities) {
    const encoded = encodeResizedImage(photon, image, dimensions, quality);
    const attempt = {
      encoded,
      width: dimensions.width,
      height: dimensions.height,
    };
    best = attempt;

    if (encoded.buffer.length <= maxBytes) {
      return { accepted: attempt, best: attempt };
    }
  }

  if (!best) {
    throw new Error("at least one resize quality must be provided");
  }

  return { best };
}

function findBestResizeAttempt(
  photon: PhotonImageModule,
  image: PhotonImage,
  targetDimensions: Dimensions,
  options: typeof DEFAULT_OPTIONS,
): ResizeAttempt {
  const initialQualities = buildQualitySteps(options.jpegQuality);
  const initialAttempt = findAttemptAtDimensions(
    photon,
    image,
    targetDimensions,
    initialQualities,
    options.maxBytes,
  );

  if (initialAttempt.accepted) {
    return initialAttempt.accepted;
  }

  let bestAttempt = initialAttempt.best;
  for (const scale of SCALE_STEPS) {
    const scaledDimensions = scaleDimensions(targetDimensions, scale);
    if (isTooSmallToContinue(scaledDimensions)) {
      break;
    }

    const scaledAttempt = findAttemptAtDimensions(
      photon,
      image,
      scaledDimensions,
      [...QUALITY_STEPS],
      options.maxBytes,
    );

    if (scaledAttempt.accepted) {
      return scaledAttempt.accepted;
    }

    bestAttempt = scaledAttempt.best;
  }

  return bestAttempt;
}

function createWorkingImage(photon: PhotonImageModule, inputBuffer: Buffer): PhotonImage {
  const inputBytes = new Uint8Array(inputBuffer);
  const rawImage = photon.PhotonImage.new_from_byteslice(inputBytes);
  const orientedImage = applyExifOrientation(photon, rawImage, inputBytes);

  if (orientedImage === rawImage) {
    return rawImage;
  }

  rawImage.free();
  return orientedImage;
}

function readDimensions(image: PhotonImage): Dimensions {
  return {
    width: image.get_width(),
    height: image.get_height(),
  };
}

export async function detectSupportedImageMimeTypeFromFile(
  filePath: string,
): Promise<SupportedImageMimeType | null> {
  const fileHandle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(FILE_TYPE_SNIFF_BYTES);
    const { bytesRead } = await fileHandle.read(buffer, 0, FILE_TYPE_SNIFF_BYTES, 0);
    if (bytesRead === 0) {
      return null;
    }

    const fileType = await fileTypeFromBuffer(buffer.subarray(0, bytesRead));
    if (!fileType || !IMAGE_MIME_TYPES.has(fileType.mime)) {
      return null;
    }

    return fileType.mime as SupportedImageMimeType;
  } finally {
    await fileHandle.close();
  }
}

export async function resizeImage(
  image: ResizableImage,
  options?: ResizeOptions,
): Promise<ResizeImageResult> {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const inputBuffer = Buffer.from(image.data, "base64");
  const photon = await loadPhoton();

  if (!photon) {
    return buildFallbackResult(image);
  }

  let workingImage: PhotonImage | undefined;

  try {
    workingImage = createWorkingImage(photon, inputBuffer);

    const originalDimensions = readDimensions(workingImage);
    if (fitsWithinLimits(originalDimensions, inputBuffer.length, resolvedOptions)) {
      return buildUnchangedResult(image, originalDimensions);
    }

    const targetDimensions = clampDimensions(
      originalDimensions,
      resolvedOptions.maxWidth,
      resolvedOptions.maxHeight,
    );
    const bestAttempt = findBestResizeAttempt(
      photon,
      workingImage,
      targetDimensions,
      resolvedOptions,
    );

    return buildResizedResult(bestAttempt, originalDimensions);
  } catch {
    return buildFallbackResult(image);
  } finally {
    workingImage?.free();
  }
}

export function formatDimensionNote(result: ResizeImageResult): string | undefined {
  if (!result.wasResized) {
    return undefined;
  }

  const scale = result.originalWidth / result.width;
  return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
