import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRequestOptions, normalizeRequestQuestions } from "./request-user-input.ts";

test("normalizeRequestOptions preserves label/value and descriptions", () => {
  assert.deepEqual(
    normalizeRequestOptions(["Yes", { label: "No", description: "Decline the change." }]),
    [
      { label: "Yes", value: "Yes" },
      { label: "No", value: "No", description: "Decline the change." },
    ],
  );
});

test("normalizeRequestQuestions converts Codex-style questions into internal form", () => {
  assert.deepEqual(
    normalizeRequestQuestions([
      {
        id: "apply_change",
        header: "Confirm",
        question: "Which approach should I use?",
        options: [
          {
            label: "Patch in place (Recommended)",
            description: "Smallest change with the least disruption.",
          },
          {
            label: "Refactor broadly",
            description: "Bigger cleanup with more surface area.",
            value: "broad_refactor",
          },
        ],
      },
    ]),
    [
      {
        id: "apply_change",
        header: "Confirm",
        question: "Which approach should I use?",
        options: [
          {
            label: "Patch in place (Recommended)",
            value: "Patch in place (Recommended)",
            description: "Smallest change with the least disruption.",
          },
          {
            label: "Refactor broadly",
            value: "broad_refactor",
            description: "Bigger cleanup with more surface area.",
          },
        ],
      },
    ],
  );
});
