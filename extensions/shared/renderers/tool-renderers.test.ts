import assert from "node:assert/strict";
import test from "node:test";

import { Text } from "@mariozechner/pi-tui";

import {
  buildHiddenCollapsedRenderer,
  buildSummaryRenderer,
  decorateGrepResultWithStats,
  summarizeFindCount,
  summarizeGrepResult,
  summarizeMatchingFileCount,
} from "./tool-renderers.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as never;

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("decorateGrepResultWithStats extracts line and file counts for grep-style output", () => {
  const result = decorateGrepResultWithStats({
    content: [
      {
        type: "text",
        text: "/tmp/a.ts:1:alpha\n/tmp/b.ts:2:beta\n/tmp/a.ts:3:gamma\n",
      },
    ],
  });

  assert.deepEqual(result.details, {
    matchCount: 3,
    fileCount: 2,
  });
  assert.equal(summarizeGrepResult(result), "Matched 3 lines in 2 files");
});

test("decorateGrepResultWithStats reports zero counts for no-match output", () => {
  const result = decorateGrepResultWithStats({
    content: [{ type: "text", text: "No matches found" }],
  });

  assert.deepEqual(result.details, {
    matchCount: 0,
    fileCount: 0,
  });
  assert.equal(summarizeGrepResult(result), "No matches found");
});

test("summary helpers format representative find and matching-file counts", () => {
  assert.equal(summarizeFindCount({ details: { count: 1 } }), "Found 1 file");
  assert.equal(summarizeMatchingFileCount({ details: { count: 4 } }), "Found 4 matching files");
});

test("buildHiddenCollapsedRenderer hides collapsed results, preserves errors, and supports expanded override", () => {
  const nativeRenderResult = () => new Text("native result", 0, 0);
  const renderExpanded = () => new Text("expanded override", 0, 0);
  const renderer = buildHiddenCollapsedRenderer({
    title: "Created",
    getDetail: () => "src/file.ts",
    nativeRenderResult,
    renderExpanded,
  });

  assert.deepEqual(trimRenderedLines(renderer.renderCall({}, theme).render(120)), ["Created src/file.ts"]);

  const collapsed = renderer.renderResult(
    { content: [{ type: "text", text: "ok" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: false },
  );
  assert.deepEqual(collapsed.render(120), []);

  const expanded = renderer.renderResult(
    { content: [{ type: "text", text: "ok" }] },
    { expanded: true, isPartial: false },
    theme,
    { isError: false, args: { path: "src/file.ts" } },
  );
  assert.deepEqual(trimRenderedLines(expanded.render(120)), ["expanded override"]);

  const errored = renderer.renderResult(
    { content: [{ type: "text", text: "boom" }] },
    { expanded: false, isPartial: false },
    theme,
    { isError: true },
  );
  assert.deepEqual(trimRenderedLines(errored.render(120)), ["native result"]);
});

test("buildSummaryRenderer shows collapsed summaries and defers expanded and error states to native rendering", () => {
  const nativeRenderResult = () => new Text("native result", 0, 0);
  const renderer = buildSummaryRenderer({
    title: "Find",
    getDetail: () => "*.ts in src",
    summarize: summarizeFindCount,
    nativeRenderResult,
  });

  assert.deepEqual(trimRenderedLines(renderer.renderCall({}, theme).render(120)), ["Find *.ts in src"]);

  const collapsed = renderer.renderResult(
    { details: { count: 3 } },
    { expanded: false, isPartial: false },
    theme,
    { isError: false },
  );
  assert.deepEqual(trimRenderedLines(collapsed.render(120)), ["Found 3 files (ctrl+o to expand)"]);

  const expanded = renderer.renderResult(
    { details: { count: 3 } },
    { expanded: true, isPartial: false },
    theme,
    { isError: false },
  );
  assert.deepEqual(trimRenderedLines(expanded.render(120)), ["native result"]);

  const errored = renderer.renderResult(
    { details: { count: 3 } },
    { expanded: false, isPartial: false },
    theme,
    { isError: true },
  );
  assert.deepEqual(trimRenderedLines(errored.render(120)), ["native result"]);
});
