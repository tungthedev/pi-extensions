const DEFAULT_ORIENTATION = 1;
const TIFF_HEADER_BYTES = 8;
const TIFF_ENTRY_BYTES = 12;
const TIFF_ORIENTATION_TAG = 0x0112;

const JPEG_START_OF_IMAGE = [0xff, 0xd8] as const;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_APP1_MARKER = 0xe1;

const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;
const WEBP_EXIF_CHUNK_ID = "EXIF";

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] as const;
const LITTLE_ENDIAN_BYTE_ORDER = 0x4949;

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) {
    return false;
  }

  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    );
  }

  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return hasBytes(bytes, 0, JPEG_START_OF_IMAGE);
}

function isWebp(bytes: Uint8Array): boolean {
  return hasBytes(bytes, 0, RIFF_SIGNATURE) && hasBytes(bytes, 8, WEBP_SIGNATURE);
}

function hasExifHeader(bytes: Uint8Array, offset: number): boolean {
  return hasBytes(bytes, offset, EXIF_HEADER);
}

function readWebpChunkId(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function readOrientationFromTiff(bytes: Uint8Array, tiffStart: number): number {
  if (tiffStart + TIFF_HEADER_BYTES > bytes.length) {
    return DEFAULT_ORIENTATION;
  }

  const byteOrder = (bytes[tiffStart] << 8) | bytes[tiffStart + 1];
  const littleEndian = byteOrder === LITTLE_ENDIAN_BYTE_ORDER;
  const ifdOffset = readUint32(bytes, tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;

  if (ifdStart + 2 > bytes.length) {
    return DEFAULT_ORIENTATION;
  }

  const entryCount = readUint16(bytes, ifdStart, littleEndian);
  for (let index = 0; index < entryCount; index += 1) {
    const entryStart = ifdStart + 2 + index * TIFF_ENTRY_BYTES;
    if (entryStart + TIFF_ENTRY_BYTES > bytes.length) {
      return DEFAULT_ORIENTATION;
    }

    const tag = readUint16(bytes, entryStart, littleEndian);
    if (tag !== TIFF_ORIENTATION_TAG) {
      continue;
    }

    const orientation = readUint16(bytes, entryStart + 8, littleEndian);
    if (orientation >= 1 && orientation <= 8) {
      return orientation;
    }

    return DEFAULT_ORIENTATION;
  }

  return DEFAULT_ORIENTATION;
}

function findJpegTiffOffset(bytes: Uint8Array): number {
  let offset = JPEG_START_OF_IMAGE.length;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) {
      return -1;
    }

    const marker = bytes[offset + 1];
    if (marker === JPEG_MARKER_PREFIX) {
      offset += 1;
      continue;
    }

    if (marker === JPEG_APP1_MARKER) {
      const segmentStart = offset + 4;
      if (segmentStart + EXIF_HEADER.length > bytes.length) {
        return -1;
      }

      if (!hasExifHeader(bytes, segmentStart)) {
        return -1;
      }

      return segmentStart + EXIF_HEADER.length;
    }

    if (offset + 4 > bytes.length) {
      return -1;
    }

    const segmentLength = readUint16(bytes, offset + 2, false);
    offset += 2 + segmentLength;
  }

  return -1;
}

function findWebpTiffOffset(bytes: Uint8Array): number {
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = readWebpChunkId(bytes, offset);
    const chunkSize = readUint32(bytes, offset + 4, true);
    const dataStart = offset + 8;

    if (chunkId === WEBP_EXIF_CHUNK_ID) {
      if (dataStart + chunkSize > bytes.length) {
        return -1;
      }

      if (chunkSize >= EXIF_HEADER.length && hasExifHeader(bytes, dataStart)) {
        return dataStart + EXIF_HEADER.length;
      }

      return dataStart;
    }

    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return -1;
}

function findTiffOffset(bytes: Uint8Array): number {
  if (isJpeg(bytes)) {
    return findJpegTiffOffset(bytes);
  }

  if (isWebp(bytes)) {
    return findWebpTiffOffset(bytes);
  }

  return -1;
}

export function getExifOrientation(bytes: Uint8Array): number {
  const tiffOffset = findTiffOffset(bytes);
  if (tiffOffset === -1) {
    return DEFAULT_ORIENTATION;
  }

  return readOrientationFromTiff(bytes, tiffOffset);
}
