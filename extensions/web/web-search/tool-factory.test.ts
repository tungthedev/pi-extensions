import assert from "node:assert/strict";
import test from "node:test";

import { createWebSearchTool } from "./tool-factory.ts";

function withSearchEnv(env: {
  exa?: string;
  gemini?: string;
}, run: () => Promise<void> | void): Promise<void> | void {
  const originalExa = process.env.EXA_API_KEY;
  const originalGemini = process.env.GEMINI_API_KEY;

  if (env.exa === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = env.exa;

  if (env.gemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = env.gemini;

  const restore = () => {
    if (originalExa === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = originalExa;

    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGemini;
  };

  try {
    const result = run();
    if (result && typeof (result as Promise<void>).finally === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test("createWebSearchTool returns a clear runtime error when objective and query are missing", async () => {
  await withSearchEnv({ gemini: "gemini-key" }, async () => {
    const tool = createWebSearchTool();
    const result = (await tool.execute("tool-1", {}, undefined, undefined, {} as never)) as {
      isError?: boolean;
      content: Array<{ text?: string }>;
    };

    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? "", /objective or query/i);
  });
});
