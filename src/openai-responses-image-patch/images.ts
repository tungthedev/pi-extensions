import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { GeneratedImageDetails, GeneratedImageSaveInput } from "./types.ts";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sanitizeFileSegment(value: string | undefined): string {
  const cleaned = (value ?? "")
    .replace(/\.\.+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : crypto.randomUUID().slice(0, 12);
}

export function generatedImagesRoot(): string {
  return path.join(process.env.HOME || os.homedir(), ".pi", "generated-images");
}

function dateSegment(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function assertPng(buffer: Buffer): void {
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error("generated image result is not a PNG");
  }
}

function decodeBase64(value: string): Buffer | undefined {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) return undefined;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return undefined;
  return Buffer.from(normalized, "base64");
}

export interface GeneratedImagePersistenceDeps {
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
}

function baseDetails(input: GeneratedImageSaveInput): GeneratedImageDetails {
  return {
    imageBase64: input.base64,
    mimeType: "image/png",
    responseId: input.responseId,
    itemId: input.itemId,
    revisedPrompt: input.revisedPrompt,
  };
}

export async function persistGeneratedPng(
  input: GeneratedImageSaveInput,
  deps: GeneratedImagePersistenceDeps = {},
): Promise<GeneratedImageDetails> {
  const buffer = decodeBase64(input.base64);
  if (!buffer) {
    return { ...baseDetails(input), error: "invalid base64 image result" };
  }

  try {
    assertPng(buffer);
  } catch (error) {
    return { ...baseDetails(input), error: error instanceof Error ? error.message : String(error) };
  }

  const root = generatedImagesRoot();
  const dayDir = path.join(root, dateSegment());
  const filePath = path.join(dayDir, `${sanitizeFileSegment(input.responseId)}-${sanitizeFileSegment(input.itemId)}.png`);
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(filePath);

  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    throw new Error("generated image path escaped output directory");
  }

  try {
    await (deps.mkdir ?? fs.mkdir)(dayDir, { recursive: true });
    await (deps.writeFile ?? fs.writeFile)(resolvedFile, buffer);
  } catch (error) {
    return {
      ...baseDetails(input),
      bytes: buffer.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return { ...baseDetails(input), path: resolvedFile, bytes: buffer.length };
}
