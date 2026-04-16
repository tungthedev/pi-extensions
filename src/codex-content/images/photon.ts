import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs");

const WASM_FILENAME = "photon_rs_bg.wasm";

type PhotonImageModule = typeof import("@silvia-odwyer/photon-node");
type MutableFs = typeof fs & { readFileSync: typeof fs.readFileSync };

let photonModule: PhotonImageModule | null = null;
let loadPromise: Promise<PhotonImageModule | null> | null = null;

function pathOrNull(file: unknown): string | null {
  if (typeof file === "string") {
    return file;
  }

  if (file instanceof URL) {
    return fileURLToPath(file);
  }

  return null;
}

function getFallbackWasmPaths(): string[] {
  const execDir = path.dirname(process.execPath);
  return [
    path.join(execDir, WASM_FILENAME),
    path.join(execDir, "photon", WASM_FILENAME),
    path.join(process.cwd(), WASM_FILENAME),
  ];
}

function replaceReadFileSync(readFileSync: typeof fs.readFileSync): void {
  const mutableFs = fs as MutableFs;

  try {
    mutableFs.readFileSync = readFileSync;
    return;
  } catch {
    Object.defineProperty(fs, "readFileSync", {
      value: readFileSync,
      writable: true,
      configurable: true,
    });
  }
}

function readFileSyncWithFallback(
  originalReadFileSync: typeof fs.readFileSync,
  args: Parameters<typeof fs.readFileSync>,
  fallbackPaths: string[],
) {
  const [file, options] = args;
  const resolvedPath = pathOrNull(file);

  if (!resolvedPath?.endsWith(WASM_FILENAME)) {
    return originalReadFileSync(...args);
  }

  try {
    return originalReadFileSync(...args);
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError?.code && systemError.code !== "ENOENT") {
      throw error;
    }

    for (const fallbackPath of fallbackPaths) {
      if (!fs.existsSync(fallbackPath)) {
        continue;
      }

      if (options === undefined) {
        return originalReadFileSync(fallbackPath);
      }

      return originalReadFileSync(fallbackPath, options as never);
    }

    throw error;
  }
}

function installPhotonWasmFallback(): () => void {
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const fallbackPaths = getFallbackWasmPaths();
  const patchedReadFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    return readFileSyncWithFallback(originalReadFileSync, args, fallbackPaths);
  }) as typeof fs.readFileSync;

  // `photon-node` expects to read its wasm from a fixed location. In Pi package
  // layouts that path can differ, so we temporarily redirect the read to a few
  // safe fallback locations while the module is being imported.
  replaceReadFileSync(patchedReadFileSync);

  return () => {
    replaceReadFileSync(originalReadFileSync);
  };
}

async function loadPhotonModuleWithFallback(): Promise<PhotonImageModule | null> {
  const restoreReadFileSync = installPhotonWasmFallback();

  try {
    photonModule = await import("@silvia-odwyer/photon-node");
    return photonModule;
  } catch {
    photonModule = null;
    return null;
  } finally {
    restoreReadFileSync();
  }
}

export async function loadPhoton(): Promise<PhotonImageModule | null> {
  if (photonModule) {
    return photonModule;
  }

  if (!loadPromise) {
    loadPromise = loadPhotonModuleWithFallback();
  }

  return loadPromise;
}

export type { PhotonImageModule };
