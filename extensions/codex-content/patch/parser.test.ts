import assert from "node:assert/strict";
import test from "node:test";

import { ApplyPatchError } from "../apply-patch.ts";
import { parsePatch } from "./parser.ts";

function expectApplyPatchError(
  callback: () => unknown,
  expectedMessage: string,
  expectedCode?: ApplyPatchError["code"],
) {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof ApplyPatchError);
    assert.equal(error.message, expectedMessage);
    if (expectedCode) {
      assert.equal(error.code, expectedCode);
    }
    return true;
  });
}

test("parsePatch rejects invalid boundaries", () => {
  expectApplyPatchError(
    () => parsePatch("bad"),
    "Invalid patch: The first line of the patch must be '*** Begin Patch'",
    "invalid_patch",
  );
  expectApplyPatchError(
    () => parsePatch("*** Begin Patch\nbad"),
    "Invalid patch: The last line of the patch must be '*** End Patch'",
    "invalid_patch",
  );
});

test("parsePatch parses add delete and update hunks", () => {
  const parsed = parsePatch(`*** Begin Patch
*** Add File: path/add.py
+abc
+def
*** Delete File: path/delete.py
*** Update File: path/update.py
*** Move to: path/update2.py
@@ def f():
-    pass
+    return 123
*** End Patch`);

  assert.deepEqual(parsed.hunks, [
    { type: "add", path: "path/add.py", contents: "abc\ndef\n" },
    { type: "delete", path: "path/delete.py" },
    {
      type: "update",
      path: "path/update.py",
      movePath: "path/update2.py",
      chunks: [
        {
          changeContext: "def f():",
          oldLines: ["    pass"],
          newLines: ["    return 123"],
          isEndOfFile: false,
        },
      ],
    },
  ]);
});

test("parsePatch supports first update chunk without explicit @@ header", () => {
  const parsed = parsePatch(`*** Begin Patch
*** Update File: file2.py
 import foo
+bar
*** End Patch`);
  assert.deepEqual(parsed.hunks, [
    {
      type: "update",
      path: "file2.py",
      chunks: [
        {
          changeContext: undefined,
          oldLines: ["import foo"],
          newLines: ["import foo", "bar"],
          isEndOfFile: false,
        },
      ],
    },
  ]);
});

test("parsePatch supports heredoc and apply_patch invocation wrappers", () => {
  const patchText = `*** Begin Patch
*** Update File: file2.py
 import foo
+bar
*** End Patch`;
  const parsedHeredoc = parsePatch(`<<'EOF'\n${patchText}\nEOF\n`);
  const parsedInvocation = parsePatch(`apply_patch <<'PATCH'\n${patchText}\nPATCH\n`);
  assert.equal(parsedHeredoc.patch, patchText);
  assert.equal(parsedInvocation.patch, patchText);
  assert.equal(parsedHeredoc.hunks.length, 1);
  assert.equal(parsedInvocation.hunks.length, 1);
});

test("parsePatch reports update hunk errors", () => {
  expectApplyPatchError(
    () =>
      parsePatch(`*** Begin Patch
*** Update File: file.py
@@
bad
*** End Patch`),
    "Invalid patch hunk on line 4: Unexpected line found in update hunk: 'bad'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)",
    "invalid_hunk",
  );
});
