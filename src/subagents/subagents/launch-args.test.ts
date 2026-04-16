import assert from "node:assert/strict";
import test from "node:test";

import { buildInteractivePiArgs } from "./launch-args.ts";

test("buildInteractivePiArgs applies model, thinking, and role prompt for forked launches", () => {
  const args = buildInteractivePiArgs({
    sessionFile: "/tmp/forked.jsonl",
    sessionDir: "/tmp/sessions",
    extensionEntry: "/tmp/interactive-child-entry.ts",
    launchMode: "fork",
    model: "openai/gpt-5",
    thinkingLevel: "high",
    developerInstructions: "Review carefully.",
  });

  assert.equal(args.includes("--session"), true);
  assert.equal(args.includes("/tmp/forked.jsonl"), true);
  assert.equal(args.includes("--model"), true);
  assert.equal(args.includes("openai/gpt-5"), true);
  assert.equal(args.includes("--thinking"), true);
  assert.equal(args.includes("high"), true);
  assert.equal(args.includes("--append-system-prompt"), true);
  assert.equal(args.includes("Review carefully."), true);
});

test("buildInteractivePiArgs preserves model/thinking but re-applies role prompt on resume launches", () => {
  const args = buildInteractivePiArgs({
    sessionFile: "/tmp/resume.jsonl",
    sessionDir: "/tmp/sessions",
    extensionEntry: "/tmp/interactive-child-entry.ts",
    launchMode: "resume",
    model: "openai/gpt-5",
    thinkingLevel: "high",
    developerInstructions: "Review carefully.",
  });

  assert.equal(args.includes("--model"), false);
  assert.equal(args.includes("--thinking"), false);
  assert.equal(args.includes("--append-system-prompt"), true);
  assert.equal(args.includes("Review carefully."), true);
});
