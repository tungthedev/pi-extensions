import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLiveAttachment, resolveChildSessionDir } from "./attachment.ts";

test("resolveChildSessionDir stores child sessions under ~/.pi/subagents/sessions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subagent-home-"));
  const homeDir = path.join(root, "home");

  try {
    const sessionDir = resolveChildSessionDir({ HOME: homeDir }, homeDir);

    assert.equal(sessionDir, path.join(homeDir, ".pi", "subagents", "sessions"));
    assert.equal(existsSync(sessionDir), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("createLiveAttachment forwards the parent cwd through process env", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subagent-spawn-"));
  const childCwd = path.join(root, "project");
  const probePath = path.join(root, "probe.json");
  const binaryPath = path.join(root, "fake-pi.js");
  const originalBinary = process.env.PI_BINARY;
  const originalProbe = process.env.SUBAGENT_TEST_PROBE_PATH;
  mkdirSync(childCwd, { recursive: true });

  writeFileSync(
    binaryPath,
    [
      "#!/bin/sh",
      "node -e \"const fs = require('node:fs'); fs.writeFileSync(process.env.SUBAGENT_TEST_PROBE_PATH, JSON.stringify({ cwd: process.cwd(), inheritedCwd: process.env.PI_SUBAGENT_CWD }));\"",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );

  process.env.PI_BINARY = binaryPath;
  process.env.SUBAGENT_TEST_PROBE_PATH = probePath;

  try {
    createLiveAttachment({ agentId: "agent-1", cwd: childCwd });

    const deadline = Date.now() + 5_000;
    while (!existsSync(probePath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(existsSync(probePath), true);
    const probe = JSON.parse(readFileSync(probePath, "utf8")) as {
      cwd: string;
      inheritedCwd: string;
    };
    assert.equal(realpathSync(probe.cwd), realpathSync(childCwd));
    assert.equal(realpathSync(probe.inheritedCwd), realpathSync(childCwd));
  } finally {
    if (originalBinary === undefined) {
      delete process.env.PI_BINARY;
    } else {
      process.env.PI_BINARY = originalBinary;
    }
    if (originalProbe === undefined) {
      delete process.env.SUBAGENT_TEST_PROBE_PATH;
    } else {
      process.env.SUBAGENT_TEST_PROBE_PATH = originalProbe;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
