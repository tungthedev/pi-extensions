import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEditorBorderLegend,
  formatRightStatus,
  formatTopBorderLine,
  normalizeCodexEditorInput,
} from "./index.ts";
import { HorizontalLineWidget } from "./widget-row.ts";

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

test("normalizeCodexEditorInput maps extra Shift+Enter sequences to canonical shift-enter", () => {
  assert.equal(normalizeCodexEditorInput("\n"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[13;2u"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\u001b[27;2;13~"), "\u001b[13;2u");
  assert.equal(normalizeCodexEditorInput("\r"), "\r");
});

test("formatTopBorderLine embeds the tool set legend into the top border", () => {
  const line = formatTopBorderLine(30, formatEditorBorderLegend("Codex"));

  assert.equal(line, "╭─ Tool set: Codex ──────────╮");
});
