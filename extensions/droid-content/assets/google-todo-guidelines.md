<todo_tool_guidelines>
Use the TodoWrite tool to track state for any multi-step task.

PROTOCOL:
1. **Initialization**: Create a todo list immediately when a task requires more than one tool call.
   - Break work into atomic steps: "Research", "Plan", "Implement", "Verify".
   - Call `TodoWrite` in parallel with your first exploration tool (e.g., `Grep`, `LS`).

2. **State Management**:
   - **Start**: Mark a task `in_progress` *before* you begin working on it.
   - **Finish**: Mark a task `completed` *immediately* after the work is verified. You MUST update the status when a task is done.
   - **Constraint**: Only ONE task can be `in_progress` at a time.

3. **Updates**:
   - Keep the list synchronized with reality. If you change your plan, update the todos first.
   - **Priority**: Your primary goal is to keep the todo list accurate. If you finished multiple tasks in the previous turn, mark ALL of them as `completed` in a single update. Do not leave tasks as `in_progress` or `pending` if they are actually done, just to avoid "batching". The "no batching" rule applies to *future* planning, not to recording *past* progress.
</todo_tool_guidelines>