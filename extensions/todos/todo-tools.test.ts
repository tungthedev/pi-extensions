import assert from "node:assert/strict";
import test from "node:test";

import { registerTodoTools } from "./todo-tools.ts";

type RegisteredTool = {
  name: string;
  execute: (...args: any[]) => Promise<any>;
  renderCall: (...args: any[]) => { render: (width: number) => string[] };
  renderResult: (...args: any[]) => { render: (width: number) => string[] };
};

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    strikethrough: (text: string) => `~~${text}~~`,
  };
}

function createHarness(config?: Partial<Parameters<typeof registerTodoTools>[1]>) {
  const tools = new Map<string, RegisteredTool>();
  const statuses: Array<{ key: string; value: string | undefined }> = [];
  const widgets: Array<{
    key: string;
    lines: string[] | undefined;
    placement: string | undefined;
  }> = [];

  const theme = createTheme();
  const ui = {
    theme,
    setStatus(key: string, value?: string) {
      statuses.push({ key, value });
    },
    setWidget(key: string, lines?: string[], options?: { placement?: string }) {
      widgets.push({ key, lines, placement: options?.placement });
    },
  };

  registerTodoTools(
    {
      on() {},
      registerTool(tool: RegisteredTool) {
        tools.set(tool.name, tool);
      },
    } as never,
    {
      writeToolName: "custom_write",
      readToolName: "custom_read",
      writeToolLabel: "custom_write",
      readToolLabel: "custom_read",
      writeCallLabel: "Update todo",
      readCallLabel: "Read todo",
      writeDescription: "Write shared todos.",
      readDescription: "Read shared todos.",
      writePromptSnippet: "Track shared todos",
      writePromptGuidelines: ["Use shared todos frequently."],
      readPromptSnippet: "Read shared todos",
      readPromptGuidelines: ["Read before large updates."],
      widgetKey: "shared:todos",
      statusKey: "shared:todos",
      ...config,
    },
  );

  return {
    tools,
    theme,
    ui,
    statuses,
    widgets,
  };
}

function trimRenderedLines(lines: string[]): string[] {
  return lines.map((line) => line.trimEnd());
}

test("registerTodoTools registers configurable write and read tool names", () => {
  const { tools } = createHarness();
  assert.ok(tools.has("custom_write"));
  assert.ok(tools.has("custom_read"));
});

test("shared todo write renders compact call and result lines for updated todos", async () => {
  const { tools, theme, ui } = createHarness();
  const todoWrite = tools.get("custom_write");
  assert.ok(todoWrite);

  assert.deepEqual(trimRenderedLines(todoWrite.renderCall({}, theme).render(80)), ["Update todo"]);

  await todoWrite.execute(
    "call-1",
    {
      todos: [
        { content: "Task A", status: "in_progress" },
        { content: "Task B", status: "pending" },
      ],
    },
    undefined,
    undefined,
    { ui },
  );

  const result = await todoWrite.execute(
    "call-2",
    {
      todos: [
        { content: "Task A", status: "completed" },
        { content: "Task B", status: "in_progress" },
        { content: "Task C", status: "pending" },
      ],
    },
    undefined,
    undefined,
    { ui },
  );

  assert.deepEqual(
    trimRenderedLines(todoWrite.renderResult(result, { expanded: false }, theme).render(120)),
    ["󰄵 ~~#1 Task A~~", "󰄗 #2 Task B", "󰄱 #3 Task C"],
  );
});

test("shared todo write adds reminder content and hides widget when nothing is in progress", async () => {
  const { tools, ui, statuses, widgets } = createHarness();
  const todoWrite = tools.get("custom_write");
  assert.ok(todoWrite);

  await todoWrite.execute(
    "call-1",
    {
      todos: [
        { content: "Task A", status: "in_progress" },
        { content: "Task B", status: "pending" },
      ],
    },
    undefined,
    undefined,
    { ui },
  );

  assert.deepEqual(statuses.at(-1), { key: "shared:todos", value: undefined });
  assert.deepEqual(widgets.at(-1), {
    key: "shared:todos",
    lines: ["Todos [0/2]: Task A"],
    placement: "aboveEditor",
  });

  const result = await todoWrite.execute(
    "call-2",
    {
      todos: [{ content: "Task A", status: "completed" }],
    },
    undefined,
    undefined,
    { ui },
  );

  assert.equal(
    result.content[0]?.text,
    [
      "[completed] #1 Task A",
      "[pending] #2 Task B",
      "",
      "1 pending todo remains with nothing in progress. Update one task to in_progress next.",
    ].join("\n"),
  );
  assert.deepEqual(statuses.at(-1), { key: "shared:todos", value: undefined });
  assert.deepEqual(widgets.at(-1), {
    key: "shared:todos",
    lines: undefined,
    placement: "aboveEditor",
  });
});

test("shared todo write renders all-complete message when no updated todo lines remain", () => {
  const { tools, theme } = createHarness();
  const todoWrite = tools.get("custom_write");
  assert.ok(todoWrite);

  assert.deepEqual(
    trimRenderedLines(
      todoWrite
        .renderResult(
          {
            details: {
              action: "todo_write",
              items: [],
              nextId: 1,
              updatedItems: [],
            },
            content: [],
          },
          { expanded: false },
          theme,
        )
        .render(120),
    ),
    ["All todos completed"],
  );
});

test("shared todo read renders the current todos with the same compact styling", () => {
  const { tools, theme } = createHarness();
  const todoRead = tools.get("custom_read");
  assert.ok(todoRead);

  assert.deepEqual(trimRenderedLines(todoRead.renderCall({}, theme).render(80)), ["Read todo"]);
  assert.deepEqual(
    trimRenderedLines(
      todoRead
        .renderResult(
          {
            details: {
              items: [
                { id: "1", content: "Task A", status: "completed" },
                { id: "2", content: "Task B", status: "in_progress" },
                { id: "3", content: "Task C", status: "pending" },
              ],
            },
            content: [],
          },
          { expanded: false },
          theme,
        )
        .render(120),
    ),
    ["󰄵 ~~#1 Task A~~", "󰄗 #2 Task B", "󰄱 #3 Task C"],
  );
});

test("shared todo read reconstructs state using the configured write tool name", async () => {
  const { tools, ui } = createHarness();
  const todoRead = tools.get("custom_read");
  assert.ok(todoRead);

  const result = await todoRead.execute("call-1", {}, undefined, undefined, {
    ui,
    sessionManager: {
      getBranch: () => [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "custom_write",
            details: {
              action: "todo_write",
              items: [{ id: "1", content: "Restored", status: "in_progress" }],
              nextId: 2,
            },
          },
        },
      ],
    },
  });

  assert.equal(result.content[0]?.text, "[in_progress] #1 Restored");
});
