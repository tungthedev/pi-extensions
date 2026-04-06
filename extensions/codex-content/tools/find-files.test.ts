import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Container } from "@mariozechner/pi-tui";

import { registerFindFilesTool } from "./find-files.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("find_files renders the call like Pi find with Search title", () => {
  let tool: any;

  registerFindFilesTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const rendered = tool.renderCall(
    { pattern: "*.ts", path: "src", limit: 10 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Search *.ts in src (limit 10)");
});

test("find_files shortens cwd-local absolute paths but keeps outside paths absolute", () => {
  let tool: any;

  registerFindFilesTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const inside = tool.renderCall(
    { pattern: "*.ts", path: path.join(process.cwd(), "extensions") },
    theme,
    { lastComponent: undefined } as never,
  );
  const outside = tool.renderCall(
    { pattern: "*.ts", path: "/tmp/demo", limit: 10 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((inside as any).text, "Search *.ts in extensions");
  assert.equal((outside as any).text, "Search *.ts in /tmp/demo (limit 10)");
});

test("find_files hides result until expanded and then uses Pi-style output rendering", () => {
  let tool: any;

  registerFindFilesTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const result = {
    content: [{ type: "text", text: "2 matching files\n/tmp/a.ts\n/tmp/b.ts" }],
  };

  const collapsed = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    theme,
    { showImages: false, lastComponent: undefined } as never,
  );

  assert.ok(collapsed instanceof Container);

  const expanded = tool.renderResult(
    result,
    { expanded: true, isPartial: false },
    theme,
    { showImages: false, lastComponent: undefined } as never,
  );

  assert.match((expanded as any).text, /2 matching files/);
  assert.match((expanded as any).text, /\/tmp\/a\.ts/);
});
