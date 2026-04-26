import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { persistGeneratedPng, sanitizeFileSegment } from "./images.ts";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let oldHome: string | undefined;
let tempHome: string;

beforeEach(async () => {
  oldHome = process.env.HOME;
  tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-image-patch-"));
  process.env.HOME = tempHome;
});

afterEach(async () => {
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
  await fs.rm(tempHome, { recursive: true, force: true });
});

test("sanitizeFileSegment removes unsafe filename characters", () => {
  expect(sanitizeFileSegment("resp/../abc 123")).toBe("resp-abc-123");
});

test("persistGeneratedPng writes under ~/.pi/generated-images", async () => {
  const result = await persistGeneratedPng({
    base64: PNG_BASE64,
    responseId: "resp_123",
    itemId: "ig_456",
    revisedPrompt: "a tiny image",
  });

  expect(result.path).toContain(path.join(tempHome, ".pi", "generated-images"));
  expect(result.mimeType).toBe("image/png");
  expect(result.bytes).toBeGreaterThan(0);
  await expect(fs.stat(result.path!)).resolves.toBeTruthy();
});

test("persistGeneratedPng decodes valid base64 with whitespace", async () => {
  const spacedBase64 = `${PNG_BASE64.slice(0, 16)}\n ${PNG_BASE64.slice(16, 48)}\t${PNG_BASE64.slice(48)}`;
  const result = await persistGeneratedPng({
    base64: spacedBase64,
    responseId: "resp_spaced",
    itemId: "ig_spaced",
  });

  expect(result.error).toBeUndefined();
  expect(result.path).toBeDefined();
  expect(result.bytes).toBeGreaterThan(0);
  await expect(fs.stat(result.path!)).resolves.toBeTruthy();
});

test("generatedImagesRoot falls back to os homedir when HOME is absent", async () => {
  delete process.env.HOME;

  const result = await persistGeneratedPng({
    base64: PNG_BASE64,
    responseId: "resp_123",
    itemId: "ig_456",
  });

  expect(result.path).toContain(path.join(os.homedir(), ".pi", "generated-images"));
  await fs.rm(path.join(os.homedir(), ".pi", "generated-images"), { recursive: true, force: true });
});

test("persistGeneratedPng reports invalid png data without losing image content", async () => {
  const imageBase64 = Buffer.from("not png").toString("base64");
  const result = await persistGeneratedPng({ base64: imageBase64 });

  expect(result.path).toBeUndefined();
  expect(result.imageBase64).toBe(imageBase64);
  expect(result.error).toContain("not a PNG");
});

test("persistGeneratedPng reports malformed base64 before png validation", async () => {
  const result = await persistGeneratedPng({ base64: "not valid base64%%%" });

  expect(result.path).toBeUndefined();
  expect(result.imageBase64).toBe("not valid base64%%%");
  expect(result.error).toContain("invalid base64");
});

test("persistGeneratedPng keeps image content when file write fails", async () => {
  const result = await persistGeneratedPng(
    { base64: PNG_BASE64, responseId: "resp", itemId: "item" },
    {
      writeFile: async () => {
        throw new Error("disk full");
      },
    },
  );

  expect(result.path).toBeUndefined();
  expect(result.imageBase64).toBe(PNG_BASE64);
  expect(result.error).toContain("disk full");
});
