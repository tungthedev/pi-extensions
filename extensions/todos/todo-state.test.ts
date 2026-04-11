import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTodoUpdates,
  createEmptyTodoSnapshot,
  restoreTodoSnapshot,
  type TodoWriteDetails,
} from "./todo-state.ts";

test("applyTodoUpdates creates, updates, and removes todo items by content", () => {
  let snapshot = createEmptyTodoSnapshot();

  snapshot = applyTodoUpdates(snapshot, [
    { content: "Research existing auth flow", status: "pending" },
    { content: "Implement token refresh", status: "in_progress" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["1", "Research existing auth flow", "pending"],
    ["2", "Implement token refresh", "in_progress"],
  ]);

  snapshot = applyTodoUpdates(snapshot, [
    { content: "Research existing auth flow", status: "completed" },
    { content: "Implement token refresh", status: "cancelled" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [["1", "Research existing auth flow", "completed"]]);
});

test("applyTodoUpdates keeps at most one in_progress item", () => {
  const snapshot = applyTodoUpdates(createEmptyTodoSnapshot(), [
    { content: "First", status: "in_progress" },
    { content: "Second", status: "in_progress" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.content, item.status]), [
    ["First", "in_progress"],
    ["Second", "pending"],
  ]);
});

test("applyTodoUpdates preserves stable ids for duplicate todo content", () => {
  let snapshot = applyTodoUpdates(createEmptyTodoSnapshot(), [
    { content: "Duplicate", status: "pending" },
    { content: "Duplicate", status: "in_progress" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["1", "Duplicate", "pending"],
    ["2", "Duplicate", "in_progress"],
  ]);

  snapshot = applyTodoUpdates(snapshot, [
    { content: "Duplicate", status: "completed" },
    { content: "Duplicate", status: "pending" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["1", "Duplicate", "completed"],
    ["2", "Duplicate", "pending"],
  ]);
});

test("applyTodoUpdates updates the targeted duplicate by id before falling back to content", () => {
  let snapshot = applyTodoUpdates(createEmptyTodoSnapshot(), [
    { content: "Duplicate", status: "pending" },
    { content: "Duplicate", status: "pending" },
  ]);

  snapshot = applyTodoUpdates(snapshot, [
    { id: "2", content: "Duplicate", status: "completed" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["1", "Duplicate", "pending"],
    ["2", "Duplicate", "completed"],
  ]);
});

test("applyTodoUpdates cancels the targeted duplicate by id", () => {
  let snapshot = applyTodoUpdates(createEmptyTodoSnapshot(), [
    { content: "Duplicate", status: "pending" },
    { content: "Duplicate", status: "in_progress" },
  ]);

  snapshot = applyTodoUpdates(snapshot, [
    { id: "1", content: "Duplicate", status: "cancelled" },
  ]);

  assert.deepEqual(snapshot.items.map((item) => [item.id, item.content, item.status]), [
    ["2", "Duplicate", "in_progress"],
  ]);
});

test("restoreTodoSnapshot returns the last persisted snapshot", () => {
  const details: TodoWriteDetails[] = [
    {
      action: "todos_write",
      items: [{ id: "1", content: "Initial", status: "pending" }],
      nextId: 2,
    },
    {
      action: "todos_write",
      items: [{ id: "1", content: "Initial", status: "completed" }],
      nextId: 2,
    },
  ];

  const restored = restoreTodoSnapshot(details);
  assert.deepEqual(restored, {
    items: [{ id: "1", content: "Initial", status: "completed" }],
    nextId: 2,
  });
});
