import type { TodoItem, TodoSnapshot, TodoUpdate, TodoWriteDetails } from "./todo-state.ts";

export function createEmptyTodoSnapshot(): TodoSnapshot {
  return {
    items: [],
    nextId: 1,
  };
}

export function normalizeTodoContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function findNextMatchingTodoIndex(
  items: TodoItem[],
  update: TodoUpdate,
  content: string,
  matchedIds: Set<string>,
): number {
  if (update.id) {
    return items.findIndex((item) => item.id === update.id && !matchedIds.has(item.id));
  }

  return items.findIndex((item) => item.content === content && !matchedIds.has(item.id));
}

export function applyTodoUpdates(snapshot: TodoSnapshot, updates: TodoUpdate[]): TodoSnapshot {
  const items = [...snapshot.items];
  let nextId = snapshot.nextId;
  const matchedIds = new Set<string>();

  for (const update of updates) {
    const content = normalizeTodoContent(update.content);
    if (!content) continue;

    const index = findNextMatchingTodoIndex(items, update, content, matchedIds);

    if (update.status === "cancelled") {
      if (index !== -1) {
        matchedIds.add(items[index].id);
        items.splice(index, 1);
      }
      continue;
    }

    if (index !== -1) {
      const existing = items[index];
      items[index] = {
        ...existing,
        status: update.status,
      };
      matchedIds.add(existing.id);
      continue;
    }

    const created: TodoItem = {
      id: String(nextId),
      content,
      status: update.status,
    };
    items.push(created);
    matchedIds.add(created.id);
    nextId += 1;
  }

  const inProgressItems = items.filter((item) => item.status === "in_progress");
  if (inProgressItems.length > 1) {
    let seenInProgress = false;
    for (const item of items) {
      if (item.status !== "in_progress") continue;
      if (!seenInProgress) {
        seenInProgress = true;
        continue;
      }
      item.status = "pending";
    }
  }

  return { items, nextId };
}

export function formatTodoSummary(items: TodoItem[]): string {
  if (items.length === 0) {
    return "No todos";
  }

  return items.map((item) => `[${item.status}] #${item.id} ${item.content}`).join("\n");
}

export function countTodoProgress(items: TodoItem[]): { completed: number; total: number } {
  return {
    completed: items.filter((item) => item.status === "completed").length,
    total: items.length,
  };
}

export function restoreTodoSnapshot(detailsList: Array<TodoWriteDetails | undefined>): TodoSnapshot {
  let snapshot = createEmptyTodoSnapshot();
  for (const details of detailsList) {
    if (!details) continue;
    snapshot = {
      items: [...details.items],
      nextId: details.nextId,
    };
  }
  return snapshot;
}
