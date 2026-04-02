export const FORGE_TODO_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type ForgeTodoStatus = (typeof FORGE_TODO_STATUSES)[number];

export type ForgeTodoItem = {
  id: string;
  content: string;
  status: Exclude<ForgeTodoStatus, "cancelled">;
};

export type ForgeTodoUpdate = {
  content: string;
  status: ForgeTodoStatus;
};

export type ForgeTodoSnapshot = {
  items: ForgeTodoItem[];
  nextId: number;
};

export type ForgeTodoWriteDetails = ForgeTodoSnapshot & {
  action: "todo_write";
};

export function createEmptyForgeTodoSnapshot(): ForgeTodoSnapshot {
  return {
    items: [],
    nextId: 1,
  };
}

function normalizeTodoContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export function applyForgeTodoUpdates(
  snapshot: ForgeTodoSnapshot,
  updates: ForgeTodoUpdate[],
): ForgeTodoSnapshot {
  const items = [...snapshot.items];
  let nextId = snapshot.nextId;

  for (const update of updates) {
    const content = normalizeTodoContent(update.content);
    if (!content) {
      continue;
    }

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

  return {
    items,
    nextId,
  };
}

export function formatForgeTodoSummary(items: ForgeTodoItem[]): string {
  if (items.length === 0) {
    return "No todos";
  }

  return items.map((item) => `[${item.status}] #${item.id} ${item.content}`).join("\n");
}

export function countForgeTodoProgress(items: ForgeTodoItem[]): {
  completed: number;
  total: number;
} {
  return {
    completed: items.filter((item) => item.status === "completed").length,
    total: items.length,
  };
}

export function restoreForgeTodoSnapshot(
  detailsList: Array<ForgeTodoWriteDetails | undefined>,
): ForgeTodoSnapshot {
  let snapshot = createEmptyForgeTodoSnapshot();
  for (const details of detailsList) {
    if (!details) continue;
    snapshot = {
      items: [...details.items],
      nextId: details.nextId,
    };
  }
  return snapshot;
}
