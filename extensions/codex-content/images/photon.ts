import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fs = require("node:fs");

const WASM_FILENAME = "photon_rs_bg.wasm";

type PhotonImageModule = typeof import("@silvia-odwyer/photon-node");

let photonModule: PhotonImageModule | null = null;
let loadPromise: Promise<PhotonImageModule | null> | null = null;

function pathOrNull(file: unknown): string | null {
  if (typeof file === "string") return file;
  if (file instanceof URL) return fileURLToPath(file);
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

function patchPhotonWasmRead(): () => void {
  const originalReadFileSync = fs.readFileSync.bind(fs);
  const fallbackPaths = getFallbackWasmPaths();
  const mutableFs = fs as typeof fs & { readFileSync: typeof fs.readFileSync };

  const patchedReadFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const [file, options] = args;
    const resolvedPath = pathOrNull(file);
    if (resolvedPath?.endsWith(WASM_FILENAME)) {
      try {
        return originalReadFileSync(...args);
      } catch (error) {
        const systemError = error as NodeJS.ErrnoException;
        if (systemError?.code && systemError.code !== "ENOENT") {
          throw error;
        }

        for (const fallbackPath of fallbackPaths) {
          if (!fs.existsSync(fallbackPath)) continue;
          if (options === undefined) return originalReadFileSync(fallbackPath);
          return originalReadFileSync(fallbackPath, options as never);
        }

        throw error;
      }
    }

    return originalReadFileSync(...args);
  }) as typeof fs.readFileSync;

  try {
    mutableFs.readFileSync = patchedReadFileSync;
  } catch {
    Object.defineProperty(fs, "readFileSync", {
      value: patchedReadFileSync,
      writable: true,
      configurable: true,
    });
  }

  return () => {
    try {
      mutableFs.readFileSync = originalReadFileSync;
    } catch {
      Object.defineProperty(fs, "readFileSync", {
        value: originalReadFileSync,
        writable: true,
        configurable: true,
      });
    }
  };
}

export async function loadPhoton(): Promise<PhotonImageModule | null> {
  if (photonModule) return photonModule;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const restoreReadFileSync = patchPhotonWasmRead();
    try {
      photonModule = await import("@silvia-odwyer/photon-node");
      return photonModule;
    } catch {
      photonModule = null;
      return photonModule;
    } finally {
      restoreReadFileSync();
    }
  })();

  return loadPromise;
}

export type { PhotonImageModule };
