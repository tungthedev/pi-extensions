import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Container } from "@mariozechner/pi-tui";

import registerReadExtension from "./index.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("read extension renders the call like Pi native read", () => {
  let tool: any;

  registerReadExtension({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const rendered = tool.renderCall(
    { file_path: "src/app.ts", offset: 3, limit: 2 },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Read src/app.ts:3-4");
});

test("read extension shortens cwd-local absolute paths but keeps outside paths absolute", () => {
  let tool: any;

  registerReadExtension({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const inside = tool.renderCall(
    { file_path: path.join(process.cwd(), "extensions/read/index.ts") },
    theme,
    { lastComponent: undefined } as never,
  );
  const outside = tool.renderCall(
    { file_path: "/tmp/outside.ts" },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((inside as any).text, "Read extensions/read/index.ts");
  assert.equal((outside as any).text, "Read /tmp/outside.ts");
});

test("read extension hides result until expanded and then uses native Pi read rendering", () => {
  let tool: any;

  registerReadExtension({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  const collapsed = tool.renderResult(
    {
      content: [{ type: "text", text: "first line\nsecond line" }],
    },
    { expanded: false, isPartial: false },
    theme,
    { args: { file_path: "notes" }, showImages: false, lastComponent: undefined } as never,
  );

  assert.ok(collapsed instanceof Container);

  const expanded = tool.renderResult(
    {
      content: [{ type: "text", text: "first line\nsecond line" }],
    },
    { expanded: true, isPartial: false },
    theme,
    { args: { file_path: "notes" }, showImages: false, lastComponent: undefined } as never,
  );

  assert.match((expanded as any).text, /first line/);
  assert.match((expanded as any).text, /second line/);
});
