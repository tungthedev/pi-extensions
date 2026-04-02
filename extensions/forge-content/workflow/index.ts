import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerForgeTodoTools } from "./todo-tools.ts";

export function registerForgeWorkflow(pi: ExtensionAPI): void {
  registerForgeTodoTools(pi);
}
