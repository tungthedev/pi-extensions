import assert from "node:assert/strict";
import test from "node:test";

import {
  applyForgeTodoUpdates,
  createEmptyForgeTodoSnapshot,
  restoreForgeTodoSnapshot,
  type ForgeTodoWriteDetails,
} from "./todo-state.ts";

test("applyForgeTodoUpdates creates, updates, and removes todo items by content", () => {
  let snapshot = createEmptyForgeTodoSnapshot();

  snapshot = applyForgeTodoUpdates(snapshot, [
    { content: "Research existing auth flow", status: "pending" },
    { content: "Implement token refresh", status: "in_progress" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["1", "Research existing auth flow", "pending"],
    ["2", "Implement token refresh", "in_progress"],
  ]);

  snapshot = applyForgeTodoUpdates(snapshot, [
    { content: "Research existing auth flow", status: "completed" },
    { content: "Implement token refresh", status: "cancelled" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [["1", "Research existing auth flow", "completed"]]);
});

test("applyForgeTodoUpdates keeps at most one in_progress item", () => {
  const snapshot = applyForgeTodoUpdates(createEmptyForgeTodoSnapshot(), [
    { content: "First", status: "in_progress" },
    { content: "Second", status: "in_progress" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.content, item.status]), [
    ["First", "in_progress"],
    ["Second", "pending"],
  ]);
});

test("restoreForgeTodoSnapshot returns the last persisted snapshot", () => {
  const details: ForgeTodoWriteDetails[] = [
    {
      action: "todo_write",
      items: [{ id: "1", content: "Initial", status: "pending" }],
      nextId: 2,
    },
    {
      action: "todo_write",
      items: [{ id: "1", content: "Initial", status: "completed" }],
      nextId: 2,
    },
  ];

  const restored = restoreForgeTodoSnapshot(details);
  assert.deepEqual(restored, {
    items: [{ id: "1", content: "Initial", status: "completed" }],
    nextId: 2,
  });
});
