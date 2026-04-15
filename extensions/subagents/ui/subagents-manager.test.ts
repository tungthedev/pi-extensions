import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@mariozechner/pi-tui";

import type { LayeredRoleRecord } from "../subagents/roles-types.ts";
import { buildListEntries, handleListInput, renderList } from "./subagents-list.ts";
import { handleDetailInput, renderDetail } from "./subagents-detail.ts";
import { DEFAULT_MODEL_HINT, MANUAL_MODEL_HINT, getVisibleModelOptions, validateManualModelInput } from "./subagents-edit.ts";
import { formatScopeOptionLabel, resolveCreateCancelTarget, resolveEditTarget, openSubagentsManager } from "./subagents-manager.ts";

function createRole(overrides: Partial<LayeredRoleRecord>): LayeredRoleRecord {
  return {
    name: "reviewer",
    description: "Review code",
    prompt: "Prompt",
    source: "builtin",
    filePath: "/tmp/reviewer.md",
    effectiveSource: "builtin",
    overridesBuiltin: false,
    ...overrides,
  };
}

test("list entries include Create new subagent first and enter opens detail for the highlighted role", () => {
  const entries = buildListEntries([
    createRole({ name: "default", source: "builtin", description: "Runtime fallback" }),
    createRole({ name: "reviewer", source: "builtin" }),
    createRole({ name: "reviewer", source: "user", effectiveSource: "user", overridesBuiltin: true }),
  ]);

  assert.equal(entries[0]?.kind, "create");
  assert.equal(entries[1]?.kind === "role" ? entries[1].role.name : undefined, "default");

  const defaultAction = handleListInput({ cursor: 1, scrollOffset: 0, query: "" }, entries, "return");
  assert.equal(defaultAction, undefined);

  const reviewerEntry = entries[2]!;
  assert.equal(reviewerEntry.kind, "role");

  const action = handleListInput({ cursor: 2, scrollOffset: 0, query: "" }, entries, "return");
  assert.deepEqual(action, { type: "open-detail", roleKey: reviewerEntry.roleKey });
});

test("list render uses accent for create row, muted for default row, and leaves a spacer after create", () => {
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  } as never;

  const entries = buildListEntries([
    createRole({ name: "default", source: "builtin", description: "Runtime fallback" }),
    createRole({ name: "reviewer", source: "builtin" }),
  ]);

  const lines = renderList({ cursor: 0, scrollOffset: 0, query: "" }, entries, 80, theme);

  assert.equal(lines[3]?.includes("Create new subagent"), true);
  assert.equal(lines[4], "");
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text.includes("Create new subagent")), true);
  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text.includes("default")), true);
});

test("list render keeps the description column aligned when the theme emits ansi escapes", () => {
  const theme = {
    fg(_color: string, text: string) {
      return `\u001b[36m${text}\u001b[0m`;
    },
  } as never;

  const entries = buildListEntries([
    createRole({ name: "default", source: "builtin", description: "Runtime fallback" }),
  ]);

  const lines = renderList({ cursor: 1, scrollOffset: 0, query: "" }, entries, 80, theme);
  const defaultLine = lines[5] ?? "";
  const plainLine = defaultLine.replace(/\u001b\[[0-9;]*m/g, "");

  assert.match(plainLine, /^→ default \[builtin\] 🔒\s+Runtime fallback$/);
  assert.equal(visibleWidth(defaultLine), visibleWidth(plainLine));
});

test("builtin edit flow requests override scope instead of mutating builtin", () => {
  const action = handleDetailInput(createRole({ source: "builtin" }), "e");
  assert.deepEqual(action, { type: "create-override" });
});

test("shadowed builtin edit flow targets the effective override instead of creating another one", () => {
  const action = handleDetailInput(createRole({ source: "builtin", shadowedBy: "user" }), "e");
  assert.deepEqual(action, { type: "edit-shadowing-override" });
});

test("delete confirm is only available for custom roles", () => {
  assert.equal(handleDetailInput(createRole({ source: "builtin" }), "d"), undefined);
  assert.deepEqual(
    handleDetailInput(createRole({ source: "project", effectiveSource: "project" }), "d"),
    { type: "confirm-delete" },
  );
});

test("manual model entry rejects bare model ids", () => {
  assert.match(validateManualModelInput("gpt-5") ?? "", /provider\/model/);
  assert.equal(validateManualModelInput("openai/gpt-5"), undefined);
});

test("model picker computes a scrollable visible window around the cursor", () => {
  const options = Array.from({ length: 10 }, (_, index) => ({
    provider: "openai",
    id: `gpt-${index}`,
    fullId: `openai/gpt-${index}`,
  }));

  const visible = getVisibleModelOptions(options, 8, 4);
  assert.equal(visible.length, 4);
  assert.equal(visible.some((option) => option.fullId === "openai/gpt-8"), true);
  assert.equal(visible.some((option) => option.fullId === "openai/gpt-9"), true);
  assert.notDeepEqual(
    visible.map((option) => option.fullId),
    options.slice(0, 4).map((option) => option.fullId),
  );
});

test("shadowed effective custom roles sort ahead of the builtin base row", () => {
  const entries = buildListEntries([
    createRole({ name: "reviewer", source: "builtin", effectiveSource: "project", shadowedBy: "project" }),
    createRole({ name: "reviewer", source: "user", effectiveSource: "project", shadowedBy: "project", overridesBuiltin: true }),
    createRole({ name: "reviewer", source: "project", effectiveSource: "project", overridesBuiltin: true }),
  ]);

  assert.equal(entries[1]?.kind, "role");
  assert.equal(entries[2]?.kind, "role");
  assert.equal(entries[3]?.kind, "role");
  assert.equal(entries[1]?.kind === "role" ? entries[1].role.source : undefined, "project");
  assert.equal(entries[3]?.kind === "role" ? entries[3].role.source : undefined, "builtin");
});

test("builtin detail copy explains full custom override semantics", () => {
  const lines = renderDetail(
    { scrollOffset: 0 },
    createRole({ source: "builtin" }),
    80,
    { fg: (_c: string, text: string) => text } as never,
  );

  assert.match(lines.join("\n"), /create custom override/i);
  assert.doesNotMatch(lines.join("\n"), /override description\/prompt/i);
});

test("shadowed builtin detail makes it clear the row is an inactive base definition", () => {
  const lines = renderDetail(
    { scrollOffset: 0 },
    createRole({ source: "builtin", shadowedBy: "project" }),
    80,
    { fg: (_c: string, text: string) => text } as never,
  );

  assert.match(lines.join("\n"), /base definition/i);
  assert.match(lines.join("\n"), /shadowed by project/i);
});

test("editing a shadowing override disables rename for the redirected custom role", () => {
  const builtin = createRole({ source: "builtin", shadowedBy: "project" });
  const project = createRole({ source: "project", effectiveSource: "project", overridesBuiltin: true });

  const target = resolveEditTarget([builtin, project], builtin, "project");
  assert.equal(target?.role.source, "project");
  assert.equal(target?.allowNameEdit, false);
});

test("manual model path exposes helpful default and format hints", () => {
  assert.match(DEFAULT_MODEL_HINT, /default/i);
  assert.match(MANUAL_MODEL_HINT, /provider\/model/i);
});

test("scope picker labels show the project target path before bootstrap", () => {
  const label = formatScopeOptionLabel("project", "/repo/.agents", false);
  assert.match(label, /\/repo\/\.agents/);
  assert.match(label, /will create/i);
});

test("create flow cancel returns to list instead of a stale previously viewed detail", async () => {
  let component: { handleInput(data: string): void; render(width: number): string[] } | undefined;
  const theme = { fg: (_c: string, text: string) => text };

  await openSubagentsManager({
    cwd: process.cwd(),
    ui: {
      theme,
      notify() {},
      custom(factory: any) {
        component = factory({ requestRender() {} }, theme, undefined, () => undefined);
        return Promise.resolve(undefined);
      },
    },
    modelRegistry: { getAvailable: () => [] },
    sessionManager: { getSessionFile: () => "/tmp/session-a.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  assert.match(component!.render(80).join("\n"), /Choose scope/);
  component!.handleInput("\u001b");
  assert.match(component!.render(80).join("\n"), /Subagents/);
});

test("cancel helper returns list for create flows even if a stale detail key exists", () => {
  assert.equal(resolveCreateCancelTarget("reviewer"), "list");
  assert.equal(resolveCreateCancelTarget(null), "list");
});
