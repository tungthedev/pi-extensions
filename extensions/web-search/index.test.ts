import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeminiClientOptions,
  citationsFromGrounding,
  insertGroundingCitations,
} from "./gemini.ts";

test("citationsFromGrounding deduplicates urls and respects cap", () => {
  const citations = citationsFromGrounding(
    [
      { web: { uri: "https://a.example", title: "A" } },
      { web: { uri: "https://a.example", title: "A duplicate" } },
      { web: { uri: "https://b.example", title: "B" } },
    ],
    1,
  );
  assert.deepEqual(citations, [{ url: "https://a.example", title: "A" }]);
});

test("insertGroundingCitations injects citation markers at byte offsets", () => {
  const text = "Hello world";
  const result = insertGroundingCitations(text, [
    { segment: { endIndex: 5 }, groundingChunkIndices: [0] },
    { segment: { endIndex: 11 }, groundingChunkIndices: [1, 2] },
  ]);
  assert.equal(result, "Hello[1] world[2][3]");
});

test("buildGeminiClientOptions forwards GEMINI_BASE_URL into httpOptions", () => {
  const previous = process.env.GEMINI_BASE_URL;
  process.env.GEMINI_BASE_URL = "https://gemini.example/v1beta";
  try {
    assert.deepEqual(buildGeminiClientOptions("test-key"), {
      apiKey: "test-key",
      httpOptions: { baseUrl: "https://gemini.example/v1beta" },
    });
  } finally {
    if (previous === undefined) {
      delete process.env.GEMINI_BASE_URL;
    } else {
      process.env.GEMINI_BASE_URL = previous;
    }
  }
});
