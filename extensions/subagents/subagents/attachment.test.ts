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
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.SUBAGENT_TEST_PROBE_PATH, JSON.stringify({ cwd: process.cwd(), inheritedCwd: process.env.PI_SUBAGENT_CWD, argv: process.argv.slice(2) }));",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );

  process.env.PI_BINARY = binaryPath;
  process.env.SUBAGENT_TEST_PROBE_PATH = probePath;

  try {
    createLiveAttachment({
      agentId: "agent-1",
      cwd: childCwd,
      profileBootstrap: {
        name: "reviewer",
        developerInstructions: "Review code carefully.",
        source: "builtin",
      },
    });

    const deadline = Date.now() + 5_000;
    while (!existsSync(probePath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(existsSync(probePath), true);
    const probe = JSON.parse(readFileSync(probePath, "utf8")) as {
      cwd: string;
      inheritedCwd: string;
      argv: string[];
    };
    assert.equal(realpathSync(probe.cwd), realpathSync(childCwd));
    assert.equal(realpathSync(probe.inheritedCwd), realpathSync(childCwd));
    assert.equal(probe.argv.includes("--append-system-prompt"), true);
    assert.equal(probe.argv.includes("Review code carefully."), true);
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

test("createLiveAttachment applies model and prompt injection for forked launches", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subagent-fork-spawn-"));
  const childCwd = path.join(root, "project");
  const probePath = path.join(root, "probe.json");
  const binaryPath = path.join(root, "fake-pi.js");
  const sessionFile = path.join(root, "forked.jsonl");
  const originalBinary = process.env.PI_BINARY;
  const originalProbe = process.env.SUBAGENT_TEST_PROBE_PATH;
  mkdirSync(childCwd, { recursive: true });
  writeFileSync(sessionFile, "");

  writeFileSync(
    binaryPath,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.SUBAGENT_TEST_PROBE_PATH, JSON.stringify({ argv: process.argv.slice(2) }));",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );

  process.env.PI_BINARY = binaryPath;
  process.env.SUBAGENT_TEST_PROBE_PATH = probePath;

  try {
    createLiveAttachment({
      agentId: "agent-2",
      cwd: childCwd,
      sessionFile,
      model: "openai/gpt-5",
      profileBootstrap: {
        name: "reviewer",
        developerInstructions: "Fork prompt.",
        source: "builtin",
      },
      launchMode: "fork",
    });

    const deadline = Date.now() + 5_000;
    while (!existsSync(probePath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(existsSync(probePath), true);
    const probe = JSON.parse(readFileSync(probePath, "utf8")) as { argv: string[] };
    assert.equal(probe.argv.includes("--session"), true);
    assert.equal(probe.argv.includes(sessionFile), true);
    assert.equal(probe.argv.includes("--model"), true);
    assert.equal(probe.argv.includes("openai/gpt-5"), true);
    assert.equal(probe.argv.includes("--append-system-prompt"), true);
    assert.equal(probe.argv.includes("Fork prompt."), true);
  } finally {
    if (originalBinary === undefined) delete process.env.PI_BINARY;
    else process.env.PI_BINARY = originalBinary;
    if (originalProbe === undefined) delete process.env.SUBAGENT_TEST_PROBE_PATH;
    else process.env.SUBAGENT_TEST_PROBE_PATH = originalProbe;
    rmSync(root, { recursive: true, force: true });
  }
});

test("createLiveAttachment re-applies role prompt on resume launches without resetting model", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "subagent-resume-spawn-"));
  const childCwd = path.join(root, "project");
  const probePath = path.join(root, "probe.json");
  const binaryPath = path.join(root, "fake-pi.js");
  const sessionFile = path.join(root, "resume.jsonl");
  const originalBinary = process.env.PI_BINARY;
  const originalProbe = process.env.SUBAGENT_TEST_PROBE_PATH;
  mkdirSync(childCwd, { recursive: true });
  writeFileSync(sessionFile, "");

  writeFileSync(
    binaryPath,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.SUBAGENT_TEST_PROBE_PATH, JSON.stringify({ argv: process.argv.slice(2) }));",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );

  process.env.PI_BINARY = binaryPath;
  process.env.SUBAGENT_TEST_PROBE_PATH = probePath;

  try {
    createLiveAttachment({
      agentId: "agent-3",
      cwd: childCwd,
      sessionFile,
      model: "openai/gpt-5",
      profileBootstrap: {
        name: "reviewer",
        developerInstructions: "Resume prompt.",
        source: "builtin",
      },
      launchMode: "resume",
    });

    const deadline = Date.now() + 5_000;
    while (!existsSync(probePath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(existsSync(probePath), true);
    const probe = JSON.parse(readFileSync(probePath, "utf8")) as { argv: string[] };
    assert.equal(probe.argv.includes("--model"), false);
    assert.equal(probe.argv.includes("--append-system-prompt"), true);
    assert.equal(probe.argv.includes("Resume prompt."), true);
  } finally {
    if (originalBinary === undefined) delete process.env.PI_BINARY;
    else process.env.PI_BINARY = originalBinary;
    if (originalProbe === undefined) delete process.env.SUBAGENT_TEST_PROBE_PATH;
    else process.env.SUBAGENT_TEST_PROBE_PATH = originalProbe;
    rmSync(root, { recursive: true, force: true });
  }
});
