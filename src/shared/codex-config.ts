import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PI_CODEX_CONFIG_PATH_ENV = "PI_CODEX_CONFIG_PATH";
const CODEX_HOME_ENV = "CODEX_HOME";
const CODEX_CONFIG_FILE = "config.toml";
const CODEX_MODELS_CACHE_FILE = "models_cache.json";
const CODEX_MODEL_CATALOG_PATH_ENV = "PI_CODEX_MODEL_CATALOG_PATH";

export function resolveCodexHome(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
): string | undefined {
  const configured = env[CODEX_HOME_ENV]?.trim();
  if (configured) {
    try {
      const stats = fs.statSync(configured);
      if (!stats.isDirectory()) return undefined;
      return fs.realpathSync(configured);
    } catch {
      return undefined;
    }
  }

  const normalizedHomeDir = homeDir?.trim();
  if (!normalizedHomeDir) return undefined;
  return path.join(normalizedHomeDir, ".codex");
}

export function resolveCodexConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
): string | undefined {
  const explicit = env[PI_CODEX_CONFIG_PATH_ENV]?.trim();
  if (explicit) return path.resolve(explicit);

  const codexHome = resolveCodexHome(env, homeDir);
  if (!codexHome) return undefined;
  return path.join(codexHome, CODEX_CONFIG_FILE);
}

export function resolveCodexModelsCachePath(
  env: NodeJS.ProcessEnv = process.env,
  homeDir = os.homedir(),
): string | undefined {
  const codexHome = resolveCodexHome(env, homeDir);
  if (!codexHome) return undefined;
  return path.join(codexHome, CODEX_MODELS_CACHE_FILE);
}

export function resolveConfiguredModelCatalogPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configuredPath = env[CODEX_MODEL_CATALOG_PATH_ENV]?.trim();
  if (!configuredPath) return undefined;
  try {
    const stats = fs.statSync(configuredPath);
    if (!stats.isFile()) return undefined;
    return fs.realpathSync(configuredPath);
  } catch {
    return undefined;
  }
}
