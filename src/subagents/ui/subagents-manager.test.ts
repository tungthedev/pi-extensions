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
  assert.deepEqual(entries[1], { kind: "section", label: "Builtin" });
  assert.equal(entries[2]?.kind === "role" ? entries[2].role.name : undefined, "default");

  const defaultAction = handleListInput({ cursor: 2, scrollOffset: 0, query: "" }, entries, "return");
  assert.equal(defaultAction, undefined);

  const reviewerEntry = entries[6]!;
  assert.equal(reviewerEntry.kind, "role");

  const action = handleListInput({ cursor: 6, scrollOffset: 0, query: "" }, entries, "return");
  assert.deepEqual(action, { type: "open-detail", roleKey: reviewerEntry.roleKey });
});

test("list render uses split active styling for create row and keeps default row muted", () => {
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
  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text === "→ "), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text.includes("Create new subagent")), true);
  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text.includes("default")), true);
});

test("list render keeps the description column aligned when the theme emits ansi escapes", () => {
  const theme = {
    fg(color: string, text: string) {
      const code = color === "accent" ? 36 : color === "muted" ? 90 : 37;
      return `\u001b[${code}m${text}\u001b[0m`;
    },
  } as never;

  const entries = buildListEntries([
    createRole({ name: "default", source: "builtin", description: "Runtime fallback" }),
  ]);

  const lines = renderList({ cursor: 2, scrollOffset: 0, query: "" }, entries, 80, theme);
  const defaultLine = lines[6] ?? "";
  const plainLine = defaultLine.replace(/\u001b\[[0-9;]*m/g, "");

  assert.match(plainLine, /^→ default 🔒\s+Runtime fallback$/);
  assert.equal(visibleWidth(defaultLine), visibleWidth(plainLine));
});

test("list render uses split active styling for selected role rows", () => {
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  } as never;

  const entries = buildListEntries([
    createRole({ name: "reviewer", source: "builtin", description: "Review code" }),
  ]);

  const lines = renderList({ cursor: 2, scrollOffset: 0, query: "" }, entries, 80, theme);

  assert.match(lines.join("\n"), /Builtin/);
  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text === "→ "), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "reviewer"), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "[builtin]"), false);
  assert.equal(lines.some((line) => /reviewer \[builtin\]/.test(line.replace(/\u001b\[[0-9;]*m/g, ""))), false);
});


test("list render separates builtin and custom roles into sections with a spacer row", () => {
  const theme = { fg: (_color: string, text: string) => text } as never;

  const entries = buildListEntries([
    createRole({ name: "reviewer", source: "builtin", description: "Builtin role" }),
    createRole({ name: "writer", source: "user", effectiveSource: "user", overridesBuiltin: true, description: "Custom role" }),
  ]);

  const lines = renderList({ cursor: 1, scrollOffset: 0, query: "" }, entries, 100, theme);
  const builtinIndex = lines.findIndex((line) => line.includes("Builtin"));
  const customIndex = lines.findIndex((line) => line.includes("Custom"));

  assert.ok(builtinIndex >= 0);
  assert.ok(customIndex > builtinIndex);
  assert.equal(lines[customIndex - 1], "");
  assert.equal(lines.some((line) => /reviewer\b/.test(line)), true);
  assert.equal(lines.some((line) => /writer \[user\]/.test(line)), true);
});

test("builtin clone flow uses c to request override scope", () => {
  const action = handleDetailInput(createRole({ source: "builtin" }), "c");
  assert.deepEqual(action, { type: "create-override" });
});

test("shadowed builtin base row also uses c to create a fresh override flow", () => {
  const action = handleDetailInput(createRole({ source: "builtin", shadowedBy: "user" }), "c");
  assert.deepEqual(action, { type: "create-override" });
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

test("sectioned list keeps builtin rows under Builtin and custom rows under Custom", () => {
  const entries = buildListEntries([
    createRole({ name: "reviewer", source: "builtin", effectiveSource: "project", shadowedBy: "project" }),
    createRole({ name: "reviewer", source: "user", effectiveSource: "project", shadowedBy: "project", overridesBuiltin: true }),
    createRole({ name: "reviewer", source: "project", effectiveSource: "project", overridesBuiltin: true }),
  ]);

  const builtinHeaderIndex = entries.findIndex((entry) => entry.kind === "section" && entry.label === "Builtin");
  const customHeaderIndex = entries.findIndex((entry) => entry.kind === "section" && entry.label === "Custom");
  const firstBuiltinRoleIndex = entries.findIndex((entry) => entry.kind === "role" && entry.role.source === "builtin");
  const firstCustomRoleIndex = entries.findIndex((entry) => entry.kind === "role" && entry.role.source !== "builtin");

  assert.ok(builtinHeaderIndex >= 0);
  assert.ok(customHeaderIndex > builtinHeaderIndex);
  assert.ok(firstBuiltinRoleIndex > builtinHeaderIndex);
  assert.ok(firstCustomRoleIndex > customHeaderIndex);
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
  assert.match(lines.join("\n"), /\[c\] clone/i);
  assert.doesNotMatch(lines.join("\n"), /\[e\] edit/i);
  assert.doesNotMatch(lines.join("\n"), /\[m\] edit model/i);
});

test("builtin detail footer shows clone-only action", () => {
  const lines = renderDetail(
    { scrollOffset: 0 },
    createRole({ source: "builtin" }),
    80,
    { fg: (_c: string, text: string) => text } as never,
  );

  assert.match(lines.join("\n"), /\[c\] clone  \[esc\] back/i);
  assert.doesNotMatch(lines.join("\n"), /override model\/thinking/i);
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

test("active scope row uses muted cursor, accent label, and muted parenthetical detail", async () => {
  let component: { handleInput(data: string): void; render(width: number): string[] } | undefined;
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  };

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
    sessionManager: { getSessionFile: () => "/tmp/session-scope-style.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.render(100);

  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text === "→ "), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "project"), true);
  assert.equal(calls.some((entry) => entry.color === "muted" && /^ \((will create|save to) /.test(entry.text)), true);
});

test("active main-editor field header uses muted cursor and accent label", async () => {
  let component: { handleInput(data: string): void; render(width: number): string[] } | undefined;
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  };

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
    sessionManager: { getSessionFile: () => "/tmp/session-main-editor.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.handleInput("\r");
  component!.render(80);

  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text === "→ "), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "Name:"), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "Description:"), false);
});

test("ctrl+e toggles between main and model editors without stealing text input letters", async () => {
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
    sessionManager: { getSessionFile: () => "/tmp/session-toggle-editor.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.handleInput("\r");
  assert.match(component!.render(80).join("\n"), /Edit role/);
  component!.handleInput("\u0005");
  assert.match(component!.render(80).join("\n"), /Model & thinking/);
  component!.handleInput("\u0005");
  assert.match(component!.render(80).join("\n"), /Edit role/);
});

test("active model-editor field header and selected suggestion use muted cursor and accent label", async () => {
  let component: { handleInput(data: string): void; render(width: number): string[] } | undefined;
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  };

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
    modelRegistry: { getAvailable: () => [
      { provider: "openai", id: "gpt-5" },
      { provider: "openai", id: "gpt-4.1" },
    ] },
    sessionManager: { getSessionFile: () => "/tmp/session-model-editor.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.handleInput("\r");
  component!.handleInput("\u0005");
  component!.render(80);

  assert.equal(calls.some((entry) => entry.color === "muted" && entry.text === "→ "), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "Model:"), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "openai/gpt-5"), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "Thinking: off"), false);
});


test("thinking editor renders a single row and uses left/right to change the selected value", async () => {
  let component: { handleInput(data: string): void; render(width: number): string[] } | undefined;
  const calls: Array<{ color: string; text: string }> = [];
  const theme = {
    fg(color: string, text: string) {
      calls.push({ color, text });
      return text;
    },
  };

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
    sessionManager: { getSessionFile: () => "/tmp/session-thinking-row.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.handleInput("\r");
  component!.handleInput("\u0005");
  component!.handleInput("\t");
  let lines = component!.render(120);
  assert.equal(lines.some((line) => line.includes("Thinking: off  minimal  low  medium  high  xhigh")), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "off"), true);

  calls.length = 0;
  component!.handleInput("\u001b[C");
  lines = component!.render(120);
  assert.equal(lines.some((line) => line.includes("Thinking: off  minimal  low  medium  high  xhigh")), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "minimal"), true);
  assert.equal(calls.some((entry) => entry.color === "accent" && entry.text === "off"), false);
});

test("model editor flow keeps every rendered line within the terminal width", async () => {
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
    sessionManager: { getSessionFile: () => "/tmp/session-b.jsonl" },
  } as never);

  assert.ok(component);
  component!.handleInput("return");
  component!.handleInput("\r");
  component!.handleInput("m");

  for (const line of component!.render(93)) {
    assert.ok(visibleWidth(line) <= 93, `expected line to fit width 93, got ${visibleWidth(line)}: ${line}`);
  }
});

test("cancel helper returns list for create flows even if a stale detail key exists", () => {
  assert.equal(resolveCreateCancelTarget("reviewer"), "list");
  assert.equal(resolveCreateCancelTarget(null), "list");
});
