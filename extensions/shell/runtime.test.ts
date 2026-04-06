import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getPiBinDir } from "../codex-content/tools/runtime.ts";
import {
  executeShellCommand,
  getShellEnv,
  readConfiguredShellPath,
  resolveShellInvocation,
  splitLeadingCdCommand,
  stripTrailingBackgroundOperator,
} from "./runtime.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-shell-settings-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withEnv(
  key: string,
  value: string | undefined,
  run: () => Promise<void> | void,
) {
  const previous = process.env[key];

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

test("readConfiguredShellPath reads shellPath from the global Pi settings file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-shell-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  try {
    await writeFile(
      settingsPath,
      `${JSON.stringify({ shellPath: "C:\\cygwin64\\bin\\bash.exe" }, null, 2)}\n`,
      "utf8",
    );

    assert.equal(await readConfiguredShellPath(settingsPath), "C:\\cygwin64\\bin\\bash.exe");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("readConfiguredShellPath ignores malformed settings files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-shell-settings-"));
  const settingsPath = path.join(tempDir, "settings.json");

  try {
    await writeFile(settingsPath, "{not-json", "utf8");
    assert.equal(await readConfiguredShellPath(settingsPath), undefined);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveShellInvocation uses supported user shells and falls back for unknown shells", () => {
  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/bin/zsh",
      login: true,
      shellExists: (shellPath) => shellPath === "/bin/zsh",
    }),
    {
      shell: "/bin/zsh",
      shellArgs: ["-lc", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/bin/zsh",
      shellExists: (shellPath) => shellPath === "/bin/zsh",
    }),
    {
      shell: "/bin/zsh",
      shellArgs: ["-c", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/opt/homebrew/bin/nu",
      login: true,
      shellExists: (shellPath) => shellPath === "/bin/bash",
    }),
    {
      shell: "/bin/bash",
      shellArgs: ["-lc", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "/opt/homebrew/bin/fish",
      login: false,
      shellExists: (shellPath) => shellPath === "/opt/homebrew/bin/fish",
    }),
    {
      shell: "/opt/homebrew/bin/fish",
      shellArgs: ["-c", "echo hi"],
    },
  );

  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      userShell: "C:\\Program Files\\Git\\bin\\bash.exe",
      login: true,
      shellExists: (shellPath) => shellPath === "C:\\Program Files\\Git\\bin\\bash.exe",
    }),
    {
      shell: "C:\\Program Files\\Git\\bin\\bash.exe",
      shellArgs: ["-lc", "echo hi"],
    },
  );
});

test("resolveShellInvocation prefers configured shellPath from settings", () => {
  assert.deepEqual(
    resolveShellInvocation("echo hi", {
      configuredShellPath: "C:\\cygwin64\\bin\\bash.exe",
      userShell: "/opt/homebrew/bin/nu",
      login: true,
      shellExists: (shellPath) => shellPath === "C:\\cygwin64\\bin\\bash.exe",
    }),
    {
      shell: "C:\\cygwin64\\bin\\bash.exe",
      shellArgs: ["-lc", "echo hi"],
    },
  );
});

test("getShellEnv prepends Pi's managed bin directory to PATH once", async () => {
  await withTempDir(async (dir) => {
    await withEnv("PI_CODING_AGENT_DIR", dir, async () => {
      await withEnv("PATH", ["/usr/bin", "/bin"].join(path.delimiter), () => {
        const shellEnv = getShellEnv();
        const pathKey = Object.keys(shellEnv).find((key) => key.toLowerCase() === "path") ?? "PATH";
        const entries = (shellEnv[pathKey] ?? "").split(path.delimiter).filter(Boolean);

        assert.equal(entries[0], getPiBinDir());
        assert.equal(entries.filter((entry) => entry === getPiBinDir()).length, 1);
      });
    });
  });
});

test("splitLeadingCdCommand parses a leading cd chain", () => {
  assert.deepEqual(splitLeadingCdCommand('cd "./nested dir" && npm test'), {
    workdir: "./nested dir",
    command: "npm test",
  });
});

test("stripTrailingBackgroundOperator removes a trailing background marker", () => {
  assert.deepEqual(stripTrailingBackgroundOperator("npm run dev &"), {
    command: "npm run dev",
    stripped: true,
  });
});

test("executeShellCommand streams stdout and stderr while preserving exit code", async () => {
  const chunks: string[] = [];

  const result = await executeShellCommand(
    {
      shell: process.execPath,
      shellArgs: [
        "-e",
        [
          'process.stdout.write("hello\\n")',
          'process.stderr.write("warn\\n")',
          "process.exit(3)",
        ].join(";"),
      ],
    },
    process.cwd(),
    {
      onData: (chunk) => chunks.push(chunk.toString("utf8")),
    },
  );

  assert.equal(result.exitCode, 3);
  assert.equal(result.timedOut, false);
  assert.equal(result.aborted, false);
  assert.equal(chunks.join(""), "hello\nwarn\n");
});

test("executeShellCommand marks timed out commands", async () => {
  const result = await executeShellCommand(
    {
      shell: process.execPath,
      shellArgs: ["-e", 'setTimeout(() => process.exit(0), 5000)'],
    },
    process.cwd(),
    {
      timeoutMs: 50,
    },
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.aborted, false);
});
