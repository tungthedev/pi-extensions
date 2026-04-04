import assert from "node:assert/strict";
import test from "node:test";

import { applyOffsetAndLimit, buildFsSearchArgs, formatFsSearchSummary } from "./fs-search.ts";

test("buildFsSearchArgs builds files_with_matches search by default", () => {
  const args = buildFsSearchArgs({ pattern: "AuthService" }, "/tmp/project");
  assert.ok(args.includes("--files-with-matches"));
  assert.ok(args.includes("AuthService"));
  assert.equal(args.at(-1), "/tmp/project");
});

test("buildFsSearchArgs enables content options when output mode is content", () => {
  const args = buildFsSearchArgs(
    {
      pattern: "token",
      output_mode: "content",
      before_context: 2,
      after_context: 3,
      case_insensitive: true,
      multiline: true,
    },
    "/tmp/project",
  );

  assert.ok(args.includes("-B"));
  assert.ok(args.includes("2"));
  assert.ok(args.includes("-A"));
  assert.ok(args.includes("3"));
  assert.ok(args.includes("-i"));
  assert.ok(args.includes("-U"));
  assert.ok(args.includes("--multiline-dotall"));
  assert.ok(args.includes("-n"));
});

test("applyOffsetAndLimit slices output lines safely", () => {
  const result = applyOffsetAndLimit("a\nb\nc\nd\n", 1, 2);
  assert.deepEqual(result, {
    text: "b\nc",
    lineCount: 2,
  });
});

test("formatFsSearchSummary shows match counts for content mode", () => {
  const summary = formatFsSearchSummary(
    {
      details: {
        output_mode: "content",
        match_count: 2,
      },
      content: [{ type: "text", text: "a\nb" }],
    },
  );

  assert.equal(summary, "Found 2 matches");
});

test("formatFsSearchSummary shows file counts for files_with_matches mode", () => {
  const summary = formatFsSearchSummary(
    {
      details: {
        output_mode: "files_with_matches",
        file_count: 2,
      },
      content: [{ type: "text", text: "src/a.ts\nsrc/b.ts" }],
    },
  );

  assert.equal(summary, "Found matches in 2 files");
});

test("formatFsSearchSummary shows match and file counts for count mode", () => {
  const summary = formatFsSearchSummary(
    {
      details: {
        output_mode: "count",
        file_count: 2,
        match_count: 4,
      },
      content: [{ type: "text", text: "src/a.ts:3\nsrc/b.ts:1" }],
    },
  );

  assert.equal(summary, "Found 4 matches in 2 files");
});

test("formatFsSearchSummary falls back to no matches text", () => {
  const summary = formatFsSearchSummary(
    {
      details: {
        output_mode: "content",
      },
      content: [{ type: "text", text: "No matches found" }],
    },
  );

  assert.equal(summary, "No matches found");
});
