export const CUSTOM_ENTRY_TYPE = "pi-codex-goal";
export const MAX_OBJECTIVE_CHARS = 8000;

export type GoalStatus = "active" | "paused" | "budgetLimited" | "complete" | "blocked";

export interface GoalUsage {
  tokensUsed: number;
  activeSeconds: number;
}

export interface ThreadGoal {
  goalId: string;
  objective: string;
  status: GoalStatus;
  tokenBudget: number | null;
  usage: GoalUsage;
  createdAt: number;
  updatedAt: number;
}

export type GoalEntrySource = "command" | "tool" | "runtime";

export type GoalBridgeTransitionKind =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "budget_changed"
  | "budget_limited"
  | "completed"
  | "blocked"
  | "cleared";

export interface GoalBridgeState {
  version: 1;
  goal: ThreadGoal | null;
  observedAt: number;
  sourceSdkSessionId?: string;
}

export interface GoalBridgeTransition {
  version: 1;
  eventId: string;
  kind: GoalBridgeTransitionKind;
  source: GoalEntrySource;
  goalId: string | null;
  previousStatus?: GoalStatus | null;
  nextStatus?: GoalStatus | null;
  tokenBudget?: number | null;
  at: number;
}

export interface GoalBridgeProjectionUpdate {
  version: 1;
  state: GoalBridgeState;
  transition?: GoalBridgeTransition;
}

export interface GoalExtensionBridge {
  onGoalUpdate?(update: GoalBridgeProjectionUpdate): void | Promise<void>;
}

export type GoalCustomEntry =
  | {
      version: 1;
      kind: "set";
      source: GoalEntrySource;
      goal: ThreadGoal;
      at: number;
    }
  | {
      version: 1;
      kind: "clear";
      source: GoalEntrySource;
      clearedGoalId: string | null;
      at: number;
    };

export interface GoalResult {
  ok: boolean;
  message: string;
  goal: ThreadGoal | null;
}

export interface GoalSnapshot {
  goal: ThreadGoal | null;
  hasGoal: boolean;
}

export interface SessionEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}
