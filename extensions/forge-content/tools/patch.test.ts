import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createEditToolDefinition, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerForgePatchTool } from "./patch.ts";

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "forge-patch-tool-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type RegisteredPatchTool = {
  name: string;
  label: string;
  parameters: { properties?: Record<string, unknown> };
  prepareArguments?: (input: unknown) => unknown;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: { cwd: string },
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
};

test("registerForgePatchTool mirrors Pi built-in edit schema under the patch name", () => {
  let tool: RegisteredPatchTool | undefined;

  registerForgePatchTool({
    registerTool(definition: RegisteredPatchTool) {
      tool = definition;
    },
  } as unknown as ExtensionAPI);

  if (!tool) {
    throw new Error("patch tool was not registered");
  }

  const builtInEdit = createEditToolDefinition(process.cwd()) as {
    parameters: { properties?: Record<string, unknown> };
    prepareArguments?: unknown;
  };

  assert.equal(tool.name, "patch");
  assert.equal(tool.label, "patch");
  assert.deepEqual(
    Object.keys(tool.parameters.properties ?? {}).sort(),
    Object.keys(builtInEdit.parameters.properties ?? {}).sort(),
  );
  assert.equal(tool.prepareArguments, builtInEdit.prepareArguments);
});

test("registerForgePatchTool delegates execution to Pi edit behavior", async () => {
  let tool: RegisteredPatchTool | undefined;

  registerForgePatchTool({
    registerTool(definition: RegisteredPatchTool) {
      tool = definition;
    },
  } as unknown as ExtensionAPI);

  if (!tool) {
    throw new Error("patch tool was not registered");
  }

  const registeredTool = tool;

  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "example.txt");
    await writeFile(filePath, "alpha\nbeta\n", "utf8");

    const usesMultiEditSchema = Object.prototype.hasOwnProperty.call(
      registeredTool.parameters.properties ?? {},
      "edits",
    );
    const params = usesMultiEditSchema
      ? {
          path: "example.txt",
          edits: [{ oldText: "beta", newText: "gamma" }],
        }
      : {
          path: "example.txt",
          oldText: "beta",
          newText: "gamma",
        };

    const result = await registeredTool.execute("call-1", params, undefined, undefined, { cwd: dir });

    assert.equal(await readFile(filePath, "utf8"), "alpha\ngamma\n");
    assert.match(result.content[0]?.text ?? "", /Successfully replaced/);
  });
});
