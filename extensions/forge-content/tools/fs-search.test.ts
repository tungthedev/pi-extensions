import assert from "node:assert/strict";
import test from "node:test";

import { applyOffsetAndLimit, buildFsSearchArgs } from "./fs-search.ts";

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
