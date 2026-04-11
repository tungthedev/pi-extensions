import assert from "node:assert/strict";
import test from "node:test";

import { createWriteToolDefinition } from "@mariozechner/pi-coding-agent";

import { registerDroidCreateTool } from "./tools/create.ts";

function captureCreateTool(): any {
  let tool: any;

  registerDroidCreateTool({
    registerTool(definition: unknown) {
      tool = definition;
    },
  } as never);

  return tool;
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

test("registerDroidCreateTool renders Created header with line count", () => {
  const tool = captureCreateTool();

  const rendered = tool.renderCall(
    { file_path: "src/new-file.ts", content: "first line\nsecond line" },
    theme,
    { lastComponent: undefined } as never,
  );

  assert.equal((rendered as any).text, "Created src/new-file.ts (2 lines)");
});

test("registerDroidCreateTool keeps result empty when collapsed and reuses Pi write rendering when expanded", () => {
  const tool = captureCreateTool();
  const nativeWriteDefinition = createWriteToolDefinition(process.cwd());
  const result = {
    content: [{ type: "text", text: "Successfully wrote 22 bytes to src/new-file.ts" }],
  };

  const collapsed = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    theme,
    {
      args: { file_path: "src/new-file.ts", content: "first line\nsecond line" },
      isError: false,
      lastComponent: undefined,
    } as never,
  );

  assert.deepEqual(collapsed.render(120), []);

  const expanded = tool.renderResult(
    result,
    { expanded: true, isPartial: false },
    theme,
    {
      args: { file_path: "src/new-file.ts", content: "first line\nsecond line" },
      isError: false,
      lastComponent: undefined,
    } as never,
  );

  const expected = nativeWriteDefinition.renderCall!(
    { path: "src/new-file.ts", content: "first line\nsecond line" },
    theme,
    {
      expanded: true,
      isPartial: false,
      argsComplete: true,
      lastComponent: undefined,
    } as never,
  );

  assert.deepEqual(expanded.render(120), expected.render(120));
});

test("registerDroidCreateTool preserves Pi write error rendering", () => {
  const tool = captureCreateTool();
  const nativeWriteDefinition = createWriteToolDefinition(process.cwd());
  const result = {
    content: [{ type: "text", text: "permission denied" }],
  };

  const rendered = tool.renderResult(
    result,
    { expanded: false, isPartial: false },
    theme,
    {
      args: { file_path: "src/new-file.ts", content: "first line" },
      isError: true,
      lastComponent: undefined,
    } as never,
  );

  const expected = nativeWriteDefinition.renderResult!(
    result as never,
    { expanded: false, isPartial: false },
    theme,
    {
      isError: true,
      lastComponent: undefined,
    } as never,
  );

  assert.deepEqual(rendered.render(120), expected.render(120));
});
