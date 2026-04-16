import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonObjectFile = Record<string, unknown>;

export async function readJsonObjectFile(
  filePath: string,
  options: { strict?: boolean } = {},
): Promise<JsonObjectFile> {
  try {
    const raw = await readFile(filePath, "utf8");
    if (!raw.trim()) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      if (options.strict) {
        throw new Error(`Invalid settings format in ${filePath}: expected object`);
      }
      return {};
    }

    return parsed as JsonObjectFile;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {};
    }
    if (options.strict) throw error;
    return {};
  }
}

export async function writeJsonObjectFileAtomically(
  filePath: string,
  value: JsonObjectFile,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;

  try {
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, filePath);
  } finally {
    await rm(tmpPath, { force: true }).catch(() => undefined);
  }
}

export async function mutateJsonObjectFile(
  filePath: string,
  mutate: (current: JsonObjectFile) => JsonObjectFile | Promise<JsonObjectFile>,
  options: { strict?: boolean } = {},
): Promise<JsonObjectFile> {
  const current = await readJsonObjectFile(filePath, options);
  const next = await mutate({ ...current });
  await writeJsonObjectFileAtomically(filePath, next);
  return next;
}
