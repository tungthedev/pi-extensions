import type { execFileSync, execSync } from "node:child_process";
import type { existsSync, readFileSync, rmSync } from "node:fs";

export type MuxBackend = "cmux" | "tmux" | "zellij" | "wezterm";

export type ExecFileAsync = (
  file: string,
  args: string[],
  options?: { encoding?: string; env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export type InteractiveBackendContext = {
  env: NodeJS.ProcessEnv;
  hasCommand: (command: string) => boolean;
  execSync: typeof execSync;
  execFileSync: typeof execFileSync;
  execFileAsync: ExecFileAsync;
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  rmSync: typeof rmSync;
  tmpdir: () => string;
  cwd: () => string;
};
