export const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export type TodoItem = {
  id: string;
  content: string;
  status: Exclude<TodoStatus, "cancelled">;
};

export type TodoUpdate = {
  id?: string;
  content: string;
  status: TodoStatus;
};

export type TodoSnapshot = {
  items: TodoItem[];
  nextId: number;
};

export type TodoWriteDetails = TodoSnapshot & {
  action: "todos_write";
  updatedItems?: TodoItem[];
};

export {
  applyTodoUpdates,
  countTodoProgress,
  createEmptyTodoSnapshot,
  formatTodoSummary,
  normalizeTodoContent,
  restoreTodoSnapshot,
} from "./store.ts";
