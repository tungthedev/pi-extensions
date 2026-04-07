import { spawn } from "node:child_process";
import fs from "node:fs";

const configPath = process.argv[2];
if (!configPath) {
  console.error("interactive launcher requires a config path");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(`failed to read interactive launcher config: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

try {
  fs.rmSync(configPath, { force: true });
} catch {
  // Ignore cleanup failure.
}

const child = spawn(config.binary, config.args, {
  cwd: config.cwd,
  env: {
    ...process.env,
    ...config.extraEnv,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`interactive launcher failed: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  for (const filePath of config.cleanupPaths ?? []) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Ignore cleanup failure.
    }
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
