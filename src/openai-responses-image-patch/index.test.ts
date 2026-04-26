import { expect, test } from "bun:test";

import registerOpenAIResponsesImagePatch from "./index.ts";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("registers a global openai-responses provider override without models", () => {
  const providers: Array<{ name: string; config: any }> = [];
  const renderers: string[] = [];

  registerOpenAIResponsesImagePatch({
    registerProvider(name: string, config: any) {
      providers.push({ name, config });
    },
    registerMessageRenderer(customType: string) {
      renderers.push(customType);
    },
    registerCommand() {},
    on() {},
  } as never);

  expect(providers).toHaveLength(1);
  expect(providers[0].name).toBe("openai-responses-image-patch");
  expect(providers[0].config.api).toBe("openai-responses");
  expect(providers[0].config.models).toBeUndefined();
  expect(typeof providers[0].config.streamSimple).toBe("function");
  expect(renderers).toContain("openai-generated-image");
});

test("does not register provider when disabled by env var", () => {
  const oldValue = process.env.PI_OPENAI_RESPONSES_IMAGE_PATCH;
  process.env.PI_OPENAI_RESPONSES_IMAGE_PATCH = "0";
  const providers: unknown[] = [];

  try {
    registerOpenAIResponsesImagePatch({
      registerProvider() {
        providers.push({});
      },
      registerMessageRenderer() {},
      registerCommand() {},
      on() {},
    } as never);
  } finally {
    if (oldValue === undefined) delete process.env.PI_OPENAI_RESPONSES_IMAGE_PATCH;
    else process.env.PI_OPENAI_RESPONSES_IMAGE_PATCH = oldValue;
  }

  expect(providers).toHaveLength(0);
});

test("filters generated image custom messages from model context", async () => {
  let contextHandler: any;
  registerOpenAIResponsesImagePatch({
    registerProvider() {},
    registerMessageRenderer() {},
    registerCommand() {},
    on(event: string, handler: any) {
      if (event === "context") contextHandler = handler;
    },
  } as never);

  const result = await contextHandler({
    messages: [
      { role: "custom", customType: "openai-generated-image", content: [] },
      { role: "user", content: "keep me" },
    ],
  });

  expect(result.messages).toEqual([{ role: "user", content: "keep me" }]);
});

test("flushes queued generated image previews after agent end", async () => {
  let agentEndHandler: any;
  const sent: any[] = [];
  registerOpenAIResponsesImagePatch({
    registerProvider() {},
    registerMessageRenderer() {},
    registerCommand() {},
    sendMessage(message: any, options: any) {
      sent.push({ message, options });
    },
    on(event: string, handler: any) {
      if (event === "agent_end") agentEndHandler = handler;
    },
  } as never);

  const { queueGeneratedImageMessage } = await import("./stream.ts");
  queueGeneratedImageMessage({
    imageBase64: PNG_BASE64,
    path: "/tmp/generated.png",
    mimeType: "image/png",
  });

  await agentEndHandler({ messages: [] });
  expect(sent).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(sent[0].message.customType).toBe("openai-generated-image");
  expect(sent[0].message.details.imageBase64).toBeUndefined();
  expect(sent[0].message.content.some((part: any) => part.type === "image")).toBe(false);
  expect(sent[0].options).toBeUndefined();
});
