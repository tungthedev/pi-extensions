import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Container } from "@mariozechner/pi-tui";

import { registerListDirTool } from "./list-dir.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("list_dir renders the call like Pi ls with List title", () => {
  let tool: any;

  registerListDirTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const rendered = tool.renderCall(
    { dir_path: "src", limit: 25 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "List src (limit 25)");
});

test("list_dir shortens cwd-local absolute paths but keeps outside paths absolute", () => {
  let tool: any;

  registerListDirTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const inside = tool.renderCall(
    { dir_path: path.join(process.cwd(), "extensions") },
    theme,
    { lastComponent: undefined } as never,
  );
  const outside = tool.renderCall(
    { dir_path: "/tmp/demo", limit: 10 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((inside as any).text, "List extensions");
  assert.equal((outside as any).text, "List /tmp/demo (limit 10)");
});

test("list_dir hides result until expanded and then uses Pi-style output rendering", () => {
  let tool: any;

  registerListDirTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const result = {
    content: [{ type: "text", text: "Absolute path: /tmp/demo\n1. [file] a.ts\n2. [dir] nested/" }],
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

  assert.match((expanded as any).text, /Absolute path: \/tmp\/demo/);
  assert.match((expanded as any).text, /1\. \[file\] a\.ts/);
});
