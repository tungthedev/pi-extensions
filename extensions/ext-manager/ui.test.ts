import assert from "node:assert/strict";
import { test } from "bun:test";

import { StackPalette } from "./ui.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
} as never;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("StackPalette catches async onSelect failures", async () => {
  let caught: unknown;
  const palette = new StackPalette(
    {
      title: "Root",
      items: [
        {
          id: "item-1",
          label: "Broken item",
          onSelect: async () => {
            throw new Error("select failed");
          },
        },
      ],
    },
    theme,
    () => undefined,
    (error) => {
      caught = error;
    },
  );

  palette.handleInput("\r");
  await flushMicrotasks();

  assert.ok(caught instanceof Error);
  assert.equal(caught.message, "select failed");
});

test("StackPalette catches async failures scheduled via ctx.run", async () => {
  let caught: unknown;
  const palette = new StackPalette(
    {
      title: "Root",
      items: [
        {
          id: "item-1",
          label: "Async hotkey",
          onSelect: () => undefined,
        },
      ],
      handleKey: (data, ctx) => {
        if (data !== "x") return false;
        ctx.run(async () => {
          throw new Error("hotkey failed");
        });
        return true;
      },
    },
    theme,
    () => undefined,
    (error) => {
      caught = error;
    },
  );

  palette.handleInput("x");
  await flushMicrotasks();

  assert.ok(caught instanceof Error);
  assert.equal(caught.message, "hotkey failed");
});
