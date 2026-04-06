export const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export type TodoItem = {
  id: string;
  content: string;
  status: Exclude<TodoStatus, "cancelled">;
};

export type TodoUpdate = {
  content: string;
  status: TodoStatus;
};

export type TodoSnapshot = {
  items: TodoItem[];
  nextId: number;
};

export type TodoWriteDetails = TodoSnapshot & {
  action: "todo_write";
  updatedItems?: TodoItem[];
};

export function createEmptyTodoSnapshot(): TodoSnapshot {
  return {
    items: [],
    nextId: 1,
  };
}

export function normalizeTodoContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function applyTodoUpdates(snapshot: TodoSnapshot, updates: TodoUpdate[]): TodoSnapshot {
  const items = [...snapshot.items];
  let nextId = snapshot.nextId;

  for (const update of updates) {
    const content = normalizeTodoContent(update.content);
    if (!content) continue;

    const index = items.findIndex((item) => item.content === content);

    if (update.status === "cancelled") {
      if (index !== -1) {
        items.splice(index, 1);
      }
      continue;
    }

    if (index !== -1) {
      items[index] = {
        ...items[index],
        status: update.status,
      };
      continue;
    }

    items.push({
      id: String(nextId),
      content,
      status: update.status,
    });
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
