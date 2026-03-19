import { initTheme } from "@mariozechner/pi-coding-agent";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { renderApplyPatchResult, summarizeApplyPatchResult } from "./apply-patch.ts";

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-9;]*m/g, "");
}

test("summarizeApplyPatchResult uses specific verbs for single-file operations", () => {
  assert.deepEqual(summarizeApplyPatchResult({ affected: { added: ["src/new.ts"] } }), {
    title: "Added",
    suffix: "src/new.ts",
  });
  assert.deepEqual(summarizeApplyPatchResult({ affected: { modified: ["src/app.ts"] } }), {
    title: "Modified",
    suffix: "src/app.ts",
  });
  assert.deepEqual(summarizeApplyPatchResult({ affected: { deleted: ["src/old.ts"] } }), {
    title: "Deleted",
    suffix: "src/old.ts",
  });
});

test("summarizeApplyPatchResult summarizes multi-file operations compactly", () => {
  assert.deepEqual(
    summarizeApplyPatchResult({
      affected: {
        added: ["src/new.ts"],
        modified: ["src/app.ts"],
        deleted: ["src/old.ts"],
      },
    }),
    { title: "Patched", suffix: "src/new.ts, src/app.ts, +1 more" },
  );
});

test("summarizeApplyPatchResult includes per-file stats for multi-file details", () => {
  const cwd = process.cwd();

  assert.deepEqual(
    summarizeApplyPatchResult({
      files: [
        {
          action: "added",
          path: path.join(cwd, "src", "inside.ts"),
          diff: "+ inside",
        },
        { action: "deleted", path: "/tmp/outside.ts", diff: "- outside" },
      ],
    }),
    {
      title: "Patched",
      suffix: "src/inside.ts (+1 -0), /tmp/outside.ts (+0 -1)",
    },
  );
});

test("renderApplyPatchResult keeps single-file stats in header when expanded", () => {
  initTheme("dark");

  const component = renderApplyPatchResult(
    {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      inverse: (text: string) => text,
    } as any,
    {
      content: [
        {
          type: "text",
          text: "Success. Updated the following files:\nA /tmp/demo.txt",
        },
      ],
      details: {
        exitCode: 0,
        affected: { added: ["/tmp/demo.txt"] },
        files: [
          {
            action: "added",
            path: "/tmp/demo.txt",
            diff: "+ apply_patch demo\n+ render check",
          },
        ],
      },
      isError: false,
    } as any,
    true,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    ["• Added /tmp/demo.txt (+2 -0)", "+ apply_patch demo", "+ render check"],
  );
});

test("renderApplyPatchResult keeps single-file stats in header when collapsed", () => {
  const component = renderApplyPatchResult(
    {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      inverse: (text: string) => text,
    } as any,
    {
      content: [
        {
          type: "text",
          text: "Success. Updated the following files:\nM /tmp/demo.txt",
        },
      ],
      details: {
        exitCode: 0,
        affected: { modified: ["/tmp/demo.txt"] },
        files: [{ action: "modified", path: "/tmp/demo.txt", diff: "- old\n+ new" }],
      },
      isError: false,
    } as any,
    false,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    ["• Modified /tmp/demo.txt (+1 -1)", "  ... +2 more lines (Ctrl+O to expand)"],
  );
});

test("renderApplyPatchResult shows per-file stats in the multi-file header when collapsed", () => {
  const cwd = process.cwd();
  const insidePath = path.join(cwd, ".tmp-apply-patch-inside.txt");

  const component = renderApplyPatchResult(
    {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      inverse: (text: string) => text,
    } as any,
    {
      content: [{ type: "text", text: "Success. Updated the following files" }],
      details: {
        exitCode: 0,
        affected: { added: [insidePath, "/tmp/pi-apply-patch-outside.txt"] },
        files: [
          { action: "added", path: insidePath, diff: "+ inside" },
          {
            action: "added",
            path: "/tmp/pi-apply-patch-outside.txt",
            diff: "+ outside",
          },
        ],
      },
      isError: false,
    } as any,
    false,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    [
      "• Patched .tmp-apply-patch-inside.txt (+1 -0), /tmp/pi-apply-patch-outside.txt (+1 -0)",
      "  ... +5 more lines (Ctrl+O to expand)",
    ],
  );
});

test("renderApplyPatchResult shows compact A/M/D file sections when expanded for multi-file patches", () => {
  const cwd = process.cwd();
  const insidePath = path.join(cwd, ".tmp-apply-patch-inside.txt");

  const component = renderApplyPatchResult(
    {
      fg: (_color: string, text: string) => text,
      bold: (text: string) => text,
      inverse: (text: string) => text,
    } as any,
    {
      content: [{ type: "text", text: "Success. Updated the following files" }],
      details: {
        exitCode: 0,
        affected: {
          added: [insidePath],
          modified: [insidePath],
          deleted: [insidePath],
        },
        files: [
          { action: "added", path: insidePath, diff: "+ inside" },
          { action: "modified", path: insidePath, diff: "- old\n+ new" },
          { action: "deleted", path: insidePath, diff: "- inside" },
        ],
      },
      isError: false,
    } as any,
    true,
  );

  assert.deepEqual(
    component.render(200).map((line) => stripAnsi(line).trimEnd()),
    [
      "• Patched .tmp-apply-patch-inside.txt (+1 -0), .tmp-apply-patch-inside.txt (+1 -1), +1 more",
      "A .tmp-apply-patch-inside.txt",
      "+ inside",
      "",
      "M .tmp-apply-patch-inside.txt",
      "- old",
      "+ new",
      "",
      "D .tmp-apply-patch-inside.txt",
      "- inside",
    ],
  );
});
