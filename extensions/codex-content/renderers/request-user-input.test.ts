import type { Theme } from "@mariozechner/pi-coding-agent";

import assert from "node:assert/strict";
import test from "node:test";

import type { RequestUserInputDetails } from "../workflow/types.ts";

import {
  buildRequestUserInputLines,
  renderRequestUserInputResult,
  summarizeRequestAnswer,
} from "./request-user-input.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

test("summarizeRequestAnswer includes structured values only in expanded view", () => {
  const answer = {
    answers: ["broad_refactor"],
    label: "Refactor broadly",
    wasCustom: false,
  };

  assert.equal(summarizeRequestAnswer(answer, false), "Refactor broadly");
  assert.equal(summarizeRequestAnswer(answer, true), "Refactor broadly [broad_refactor]");
});

test("buildRequestUserInputLines renders asked questions only and preserves interruption summary", () => {
  const details: RequestUserInputDetails = {
    questions: [
      {
        id: "approach",
        header: "Confirm",
        question: "Which approach should I use?",
        options: [],
      },
      {
        id: "notes",
        header: "Notes",
        question: "Anything else to preserve?",
        options: [],
      },
      {
        id: "follow_up",
        header: "Scope",
        question: "Should I also update docs?",
        options: [],
      },
    ],
    answers: {
      approach: {
        answers: ["Patch in place (Recommended)"],
        label: "Patch in place (Recommended)",
        wasCustom: false,
      },
      notes: {
        answers: [],
        cancelled: true,
      },
    },
    interrupted: true,
  };

  assert.deepEqual(buildRequestUserInputLines(theme, details, false), [
    "• Asked Which approach should I use?",
    "└ Confirm: Patch in place (Recommended)",
    "• Asked Anything else to preserve?",
    "└ Notes: Cancelled",
    "• Interrupted after 1/3 answers",
  ]);
});

test("buildRequestUserInputLines labels typed answers clearly", () => {
  const details: RequestUserInputDetails = {
    questions: [
      {
        id: "notes",
        header: "Notes",
        question: "Anything else to preserve?",
        options: [],
      },
    ],
    answers: {
      notes: {
        answers: ["Keep the current API shape", "user_note: Keep the current API shape"],
        label: "Keep the current API shape",
        wasCustom: true,
      },
    },
    interrupted: false,
  };

  assert.deepEqual(buildRequestUserInputLines(theme, details, false), [
    "• Asked Anything else to preserve?",
    "└ Notes: Typed: Keep the current API shape",
  ]);
});

test("renderRequestUserInputResult shows hidden line counts when collapsed content is truncated", () => {
  const details: RequestUserInputDetails = {
    questions: [
      {
        id: "notes",
        header: "Notes",
        question:
          "Please describe the exact compatibility constraints and migration concerns I should keep in mind while patching this renderer output.",
        options: [],
      },
    ],
    answers: {
      notes: {
        answers: ["preserve_current_contract"],
        label:
          "Preserve the current contract and avoid changing tool output semantics unless absolutely necessary.",
        wasCustom: false,
      },
    },
    interrupted: false,
  };

  const component = renderRequestUserInputResult(
    theme,
    {
      content: [{ type: "text", text: "Collected user input" }],
      details,
      isError: false,
    } as any,
    false,
  );

  assert.deepEqual(
    component.render(200).map((line) => line.trimEnd()),
    [
      "• Asked Please describe the exact compatibility constraints and migration concerns I should kee...",
      "└ Notes: Preserve the current contract and avoid changing tool output semantics unless absolutel...",
      "  ... +2 more lines (Ctrl+O to expand)",
    ],
  );
});
