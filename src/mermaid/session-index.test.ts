import assert from "node:assert/strict";
import test from "node:test";

import { indexSessionDiagrams, type DiagramEntry } from "./session-index.ts";

function mermaidBlock(code: string): string {
  return `\`\`\`mermaid\n${code}\n\`\`\``;
}

test("indexSessionDiagrams restores assistant and user Mermaid blocks", () => {
  const diagrams = indexSessionDiagrams([
    {
      id: "assistant-1",
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: mermaidBlock("graph TD\nA-->B") }],
      },
    },
    {
      id: "user-1",
      type: "message",
      message: {
        role: "user",
        content: mermaidBlock("graph TD\nB-->C"),
      },
    },
  ]);

  assert.equal(diagrams.length, 2);
  assert.equal(diagrams[0]?.source, "assistant");
  assert.equal(diagrams[1]?.source, "user");
  assert.match(diagrams[0]?.block.code ?? "", /A-->B/);
  assert.match(diagrams[1]?.block.code ?? "", /B-->C/);
});

test("indexSessionDiagrams restores stored custom Mermaid entries with an empty in-memory cache", () => {
  const stored: DiagramEntry = {
    id: "stored-1",
    block: {
      code: "graph TD\nA-->B",
      blockIndex: 0,
      startLine: 1,
      endLine: 3,
    },
    context: { beforeLines: ["before"], afterLines: ["after"] },
    source: "assistant",
  };

  const diagrams = indexSessionDiagrams([
    {
      type: "custom",
      customType: "mermaid-inline",
      data: stored,
    },
  ]);

  assert.deepEqual(diagrams, [stored]);
});

test("indexSessionDiagrams suppresses duplicates from stored custom messages and source messages", () => {
  const diagrams = indexSessionDiagrams([
    {
      id: "assistant-1",
      type: "message",
      message: {
        role: "assistant",
        content: mermaidBlock("graph TD\nA-->B"),
      },
    },
    {
      type: "custom",
      customType: "mermaid-inline",
      data: {
        id: "stored-1",
        block: {
          code: "graph TD\nA-->B",
          blockIndex: 0,
          startLine: 1,
          endLine: 3,
        },
        context: { beforeLines: [], afterLines: [] },
        source: "assistant",
      },
    },
  ]);

  assert.equal(diagrams.length, 1);
  assert.equal(diagrams[0]?.id, "stored-1");
});

test("indexSessionDiagrams ignores oversize Mermaid blocks", () => {
  const diagrams = indexSessionDiagrams(
    [
      {
        id: "assistant-1",
        type: "message",
        message: {
          role: "assistant",
          content: mermaidBlock(`graph TD\n${"A".repeat(25_000)}`),
        },
      },
    ],
    { maxCodeLength: 20_000 },
  );

  assert.deepEqual(diagrams, []);
});
