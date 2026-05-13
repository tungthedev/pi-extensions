import { expect, test } from "bun:test";

import registerMermaidExtension from "./index.js";

function createPiHarness() {
  const handlers = new Map<string, any>();
  const sent: Array<{ message: any; options: any }> = [];

  registerMermaidExtension({
    registerMessageRenderer() {},
    registerShortcut() {},
    registerCommand() {},
    sendMessage(message: any, options: any) {
      sent.push({ message, options });
    },
    on(event: string, handler: any) {
      handlers.set(event, handler);
    },
  } as never);

  return { handlers, sent };
}

test("flushes assistant Mermaid preview after agent end", async () => {
  const { handlers, sent } = createPiHarness();
  const messageEndHandler = handlers.get("message_end");
  const agentEndHandler = handlers.get("agent_end");

  await messageEndHandler(
    {
      message: {
        role: "assistant",
        content: "```mermaid\ngraph TD\nA-->B\n```",
      },
    },
    { sessionManager: { getBranch: () => [] } },
  );

  expect(sent).toHaveLength(0);

  await agentEndHandler({ messages: [] });
  expect(sent).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(sent).toHaveLength(1);
  expect(sent[0].message.customType).toBe("mermaid-inline");
  expect(sent[0].message.display).toBe(true);
  expect(sent[0].message.details.block.code).toContain("A-->B");
  expect(sent[0].options).toBeUndefined();
});

