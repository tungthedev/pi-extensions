import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { appendFileSync, writeFileSync } from "node:fs";

export function shouldMarkUserTookOver(agentStarted: boolean): boolean {
  return agentStarted;
}

export function shouldAutoExitOnAgentEnd(
  userTookOver: boolean,
  messages: Array<{ role?: string; stopReason?: string }> | undefined,
): boolean {
  if (userTookOver) return false;

  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === "assistant") {
        return message.stopReason !== "aborted";
      }
    }
  }

  return true;
}

function writeExitSignal(payload: { type: "ping"; name: string; message: string }): void {
  const sessionFile = process.env.PI_SUBAGENT_SESSION;
  if (sessionFile) {
    writeFileSync(`${sessionFile}.exit`, JSON.stringify(payload));
  }
}

function appendUpdateSignal(message: string): void {
  const sessionFile = process.env.PI_SUBAGENT_SESSION;
  if (sessionFile) {
    appendFileSync(`${sessionFile}.signals`, `${JSON.stringify({ type: "update", message })}\n`);
  }
}

function registerInteractiveCallerUpdateTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "caller_update",
    label: "caller_update",
    description:
      "Send a short progress update to the parent session without exiting. Use this for long-running work when you are still making progress and want the parent to know what is happening. After calling it, continue working unless you are blocked.",
    parameters: Type.Object({
      message: Type.String({ description: "A brief progress update and what the parent should expect next" }),
    }),
    async execute(_toolCallId, params) {
      appendUpdateSignal(params.message);
      return {
        content: [{ type: "text", text: "Update sent. Continue working unless you need to stop." }],
        details: {},
      };
    },
  });
}

export default function interactiveChild(pi: ExtensionAPI) {
  let userTookOver = false;
  let agentStarted = false;

  pi.on("agent_start", () => {
    agentStarted = true;
  });

  pi.on("input", () => {
    if (!shouldMarkUserTookOver(agentStarted)) {
      return;
    }
    userTookOver = true;
  });

  pi.on("agent_end", (event, ctx) => {
    const messages = (event as { messages?: Array<{ role?: string; stopReason?: string }> }).messages;
    const shouldExit = shouldAutoExitOnAgentEnd(userTookOver, messages);
    if (!shouldExit) {
      userTookOver = false;
      return;
    }

    ctx.shutdown();
  });

  pi.registerTool({
    name: "caller_ping",
    label: "caller_ping",
    description:
      "Use this only when you are blocked and need the parent session to answer a question, make a decision, or take an action before you can continue. This exits the child session so the parent is notified and can resume you later.",
    parameters: Type.Object({
      message: Type.String({ description: "What you need from the parent, stated briefly and specifically" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const name = process.env.PI_SUBAGENT_NAME?.trim() || "subagent";
      writeExitSignal({ type: "ping", name, message: params.message });
      ctx.shutdown();
      return {
        content: [{ type: "text", text: "Ping sent. Session will exit and parent will be notified." }],
        details: {},
      };
    },
  });

  registerInteractiveCallerUpdateTool(pi);
}
