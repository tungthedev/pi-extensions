import { execSync, execFileSync, execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type { InteractiveBackendContext } from "./backends/types.ts";

const execFileAsync = promisify(execFile);

export function createInteractiveContext(
  overrides: Partial<InteractiveBackendContext> = {},
): InteractiveBackendContext {
  const commandAvailability = new Map<string, boolean>();

  const hasCommand = overrides.hasCommand ?? ((command: string) => {
    if (commandAvailability.has(command)) {
      return commandAvailability.get(command)!;
    }

    let available = false;
    try {
      (overrides.execSync ?? execSync)(`command -v ${command}`, { stdio: "ignore" });
      available = true;
    } catch {
      available = false;
    }

    commandAvailability.set(command, available);
    return available;
  });

  return {
    env: overrides.env ?? process.env,
    hasCommand,
    execSync: overrides.execSync ?? execSync,
    execFileSync: overrides.execFileSync ?? execFileSync,
    execFileAsync:
      overrides.execFileAsync ??
      (async (file, args, options) => {
        const result = await execFileAsync(file, args, options);
        return {
          stdout: String(result.stdout ?? ""),
          stderr: String(result.stderr ?? ""),
        };
      }),
    existsSync: overrides.existsSync ?? existsSync,
    readFileSync: overrides.readFileSync ?? readFileSync,
    rmSync: overrides.rmSync ?? rmSync,
    tmpdir: overrides.tmpdir ?? tmpdir,
    cwd: overrides.cwd ?? (() => process.cwd()),
  };
}
