import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLeftStatus,
  formatRightStatus,
  formatUsageSummary,
  normalizeCodexEditorInput,
} from "./editor/index.ts";
import { HorizontalLineWidget } from "./editor/widget-row.ts";

test("formatUsageSummary renders percent and compact window size", () => {
  assert.equal(
    formatUsageSummary({ tokens: 238544, contextWindow: 272000, percent: 87.7 }),
    "87.7%/272k",
  );
});

test("formatLeftStatus combines model, thinking level, and usage", () => {
  assert.equal(
    formatLeftStatus({
      cwd: "/Volumes/Data/Projects/exp/codex-agent",
      modelId: "gpt-5.4-mini",
      thinkingLevel: "medium",
      usage: { tokens: 238544, contextWindow: 272000, percent: 87.7 },
    }),
    "gpt-5.4-mini medium · 87.7%/272k",
  );
});

test("formatRightStatus combines cwd and git branch", () => {
  assert.equal(
    formatRightStatus({
      cwd: "/Volumes/Data/Projects/exp/codex-agent",
      gitBranch: "main",
    }),
    "/Volumes/Data/Projects/exp/codex-agent · main",
  );
});

test("formatRightStatus truncates the cwd from the left on narrow screens", () => {
  assert.equal(
    formatRightStatus(
      {
        cwd: "/Volumes/Data/Projects/exp/pi-extensions",
        gitBranch: "main",
      },
      37,
    ),
    ".../Projects/exp/pi-extensions · main",
  );
});

test("formatRightStatus keeps the branch when space is tight", () => {
  assert.equal(
    formatRightStatus(
      {
        cwd: "/Volumes/Data/Projects/exp/pi-extensions",
        gitBranch: "main",
      },
      12,
    ),
    ".../s · main",
  );
});

test("HorizontalLineWidget re-renders the right status with the tighter budget", () => {
  const widget = new HorizontalLineWidget(() => [
    {
      align: "left",
      renderInline: () => "gpt-5.4-mini · 87.7%/272k",
    },
    {
      align: "right",
      renderInline: (maxWidth) =>
        formatRightStatus(
          {
            cwd: "/Volumes/Data/Projects/exp/pi-extensions",
            gitBranch: "main",
          },
          maxWidth,
        ),
    },
  ]);

  const line = widget.render(50)[0] ?? "";
  assert.ok(line.includes(".../"));
  assert.ok(line.endsWith(" · main"));
  assert.ok(!line.includes("/Volumes/Data/Projects"));
});

test("formatLeftStatus omits disabled thinking level", () => {
  assert.equal(
    formatLeftStatus({
      cwd: "/Volumes/Data/Projects/exp/codex-agent",
      modelId: "gpt-5.4-mini",
      thinkingLevel: "off",
      usage: undefined,
    }),
    "gpt-5.4-mini",
  );
});

test("normalizeCodexEditorInput maps extra Shift+Enter sequences to canonical shift-enter", () => {
  assert.equal(normalizeCodexEditorInput("\n"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[13;2u"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[27;2;13~"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\r"), "\r");
});
