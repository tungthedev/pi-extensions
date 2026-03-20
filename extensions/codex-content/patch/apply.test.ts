import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ApplyPatchError, applyPatch } from "../apply-patch.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "codex-apply-patch-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("applyPatch adds a file and prints summary", async () => {
  await withTempDir(async (dir) => {
    const result = await applyPatch(
      `*** Begin Patch
*** Add File: add.txt
+ab
+cd
*** End Patch`,
      dir,
    );
    assert.equal(result.summary, "Success. Updated the following files:\nA add.txt\n");
    assert.deepEqual(result.files, [{ action: "added", path: "add.txt", diff: "+ ab\n+ cd" }]);
    assert.equal(await readFile(path.join(dir, "add.txt"), "utf8"), "ab\ncd\n");
  });
});

test("applyPatch deletes a file", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "del.txt");
    await writeFile(filePath, "x", "utf8");
    const result = await applyPatch(
      `*** Begin Patch
*** Delete File: del.txt
*** End Patch`,
      dir,
    );
    assert.equal(result.summary, "Success. Updated the following files:\nD del.txt\n");
    assert.deepEqual(result.files, [{ action: "deleted", path: "del.txt", diff: "- x" }]);
    await assert.rejects(readFile(filePath, "utf8"));
  });
});

test("applyPatch updates file content", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "update.txt"), "foo\nbar\n", "utf8");
    const result = await applyPatch(
      `*** Begin Patch
*** Update File: update.txt
@@
 foo
-bar
+baz
*** End Patch`,
      dir,
    );
    assert.equal(result.summary, "Success. Updated the following files:\nM update.txt\n");
    assert.deepEqual(result.files, [
      { action: "modified", path: "update.txt", diff: "  foo\n- bar\n+ baz" },
    ]);
    assert.equal(await readFile(path.join(dir, "update.txt"), "utf8"), "foo\nbaz\n");
  });
});

test("applyPatch can move a file", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "src.txt"), "line\n", "utf8");
    const result = await applyPatch(
      `*** Begin Patch
*** Update File: src.txt
*** Move to: dst.txt
@@
-line
+line2
*** End Patch`,
      dir,
    );
    assert.equal(result.summary, "Success. Updated the following files:\nM dst.txt\n");
    assert.deepEqual(result.files, [
      { action: "moved", path: "dst.txt", sourcePath: "src.txt", diff: "- line\n+ line2" },
    ]);
    assert.equal(await readFile(path.join(dir, "dst.txt"), "utf8"), "line2\n");
    await assert.rejects(readFile(path.join(dir, "src.txt"), "utf8"));
  });
});

test("applyPatch supports multiple update chunks in one file", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "multi.txt"), "foo\nbar\nbaz\nqux\n", "utf8");
    await applyPatch(
      `*** Begin Patch
*** Update File: multi.txt
@@
 foo
-bar
+BAR
@@
 baz
-qux
+QUX
*** End Patch`,
      dir,
    );
    assert.equal(await readFile(path.join(dir, "multi.txt"), "utf8"), "foo\nBAR\nbaz\nQUX\n");
  });
});

test("applyPatch handles interleaved changes and EOF insertion", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "interleaved.txt"), "a\nb\nc\nd\ne\nf\n", "utf8");
    await applyPatch(
      `*** Begin Patch
*** Update File: interleaved.txt
@@
 a
-b
+B
@@
 c
 d
-e
+E
@@
 f
+g
*** End of File
*** End Patch`,
      dir,
    );
    assert.equal(
      await readFile(path.join(dir, "interleaved.txt"), "utf8"),
      "a\nB\nc\nd\nE\nf\ng\n",
    );
  });
});

test("applyPatch supports pure addition chunk followed by removal", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "panic.txt"), "line1\nline2\nline3\n", "utf8");
    await applyPatch(
      `*** Begin Patch
*** Update File: panic.txt
@@
+after-context
+second-line
@@
 line1
-line2
-line3
+line2-replacement
*** End Patch`,
      dir,
    );
    assert.equal(
      await readFile(path.join(dir, "panic.txt"), "utf8"),
      "line1\nline2-replacement\nafter-context\nsecond-line\n",
    );
  });
});

test("applyPatch can match unicode punctuation with ASCII patch text", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "unicode.py"),
      "import asyncio  # local import – avoids top‑level dep\n",
      "utf8",
    );
    await applyPatch(
      `*** Begin Patch
*** Update File: unicode.py
@@
-import asyncio  # local import - avoids top-level dep
+import asyncio  # HELLO
*** End Patch`,
      dir,
    );
    assert.equal(await readFile(path.join(dir, "unicode.py"), "utf8"), "import asyncio  # HELLO\n");
  });
});

test("applyPatch preserves BOM and CRLF line endings on update", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "crlf.txt");
    await writeFile(filePath, "\uFEFFfoo\r\nbar\r\n", "utf8");

    await applyPatch(
      `*** Begin Patch
*** Update File: crlf.txt
@@
 foo
-bar
+baz
*** End Patch`,
      dir,
    );

    assert.deepEqual(await readFile(filePath), Buffer.from("\uFEFFfoo\r\nbaz\r\n", "utf8"));
  });
});

test("applyPatch rejects placeholder redaction content", async () => {
  await withTempDir(async (dir) => {
    const redactionMarker = `[RED${"ACTED"}]`;

    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** Add File: redacted.txt
+${redactionMarker}
*** End Patch`,
          dir,
        ),
      /Rejected patch: added content contains placeholder text/i,
    );
  });
});

test("applyPatch rejects binary file updates", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "binary.bin");
    await writeFile(filePath, Buffer.from([0, 1, 2, 3]));

    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** Update File: binary.bin
@@
-ignored
+replacement
*** End Patch`,
          dir,
        ),
      /file appears to be binary/i,
    );
  });
});

test("applyPatch can delete binary files", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "binary.bin");
    await writeFile(filePath, Buffer.from([0, 1, 2, 3]));

    const result = await applyPatch(
      `*** Begin Patch
*** Delete File: binary.bin
*** End Patch`,
      dir,
    );

    assert.equal(result.summary, "Success. Updated the following files:\nD binary.bin\n");
    await assert.rejects(readFile(filePath));
  });
});

test("applyPatch rejects adding over an existing file", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "existing.txt");
    await writeFile(filePath, "keep me\n", "utf8");
    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** Add File: existing.txt
+new contents
*** End Patch`,
          dir,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ApplyPatchError);
        assert.equal(error.message, `Failed to write file ${filePath}: destination already exists`);
        return true;
      },
    );
    assert.equal(await readFile(filePath, "utf8"), "keep me\n");
  });
});

test("applyPatch rejects moving over an existing destination", async () => {
  await withTempDir(async (dir) => {
    const sourcePath = path.join(dir, "src.txt");
    const destinationPath = path.join(dir, "dst.txt");
    await writeFile(sourcePath, "line\n", "utf8");
    await writeFile(destinationPath, "destination\n", "utf8");
    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** Update File: src.txt
*** Move to: dst.txt
@@
-line
+line2
*** End Patch`,
          dir,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ApplyPatchError);
        assert.equal(
          error.message,
          `Failed to write file ${destinationPath}: destination already exists`,
        );
        return true;
      },
    );
    assert.equal(await readFile(sourcePath, "utf8"), "line\n");
    assert.equal(await readFile(destinationPath, "utf8"), "destination\n");
  });
});

test("applyPatch leaves filesystem unchanged when a later hunk fails", async () => {
  await withTempDir(async (dir) => {
    const addedPath = path.join(dir, "added.txt");
    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** Add File: added.txt
+hello
*** Update File: missing.txt
@@
-nope
+still nope
*** End Patch`,
          dir,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ApplyPatchError);
        assert.match(error.message, /Failed to read file to update/);
        return true;
      },
    );
    await assert.rejects(readFile(addedPath, "utf8"));
  });
});

test("applyPatch summary de-duplicates repeated file ops", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "dup.txt"), "a\nb\nc\n", "utf8");
    const result = await applyPatch(
      `*** Begin Patch
*** Update File: dup.txt
@@
-a
+A
*** Update File: dup.txt
@@
 b
-c
+C
*** End Patch`,
      dir,
    );
    assert.equal(result.summary, "Success. Updated the following files:\nM dup.txt\n");
    assert.equal(await readFile(path.join(dir, "dup.txt"), "utf8"), "A\nb\nC\n");
  });
});

test("applyPatch errors on empty patch body", async () => {
  await withTempDir(async (dir) => {
    await assert.rejects(
      () =>
        applyPatch(
          `*** Begin Patch
*** End Patch`,
          dir,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ApplyPatchError);
        assert.equal(error.message, "No files were modified.");
        return true;
      },
    );
  });
});
