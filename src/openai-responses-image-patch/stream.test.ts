import type { Context, Model } from "@mariozechner/pi-ai";

import { expect, test } from "bun:test";

import {
  buildOpenAIResponsesSimpleOptions,
  createOpenAIResponsesImageStream,
  flushGeneratedImageMessages,
  streamSimpleOpenAIResponsesWithImages,
} from "./stream.ts";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function model(overrides: Partial<Model<"openai-responses">> = {}): Model<"openai-responses"> {
  return {
    id: "gpt-5.1",
    name: "GPT-5.1",
    api: "openai-responses",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    ...overrides,
  };
}

async function collect(stream: AsyncIterable<any>) {
  const events: any[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

test("streamSimple queues custom image message for idle display when parser saves image", async () => {
  const sent: Array<{ message: any; options: any }> = [];
  const pi = {
    sendMessage(message: any, options: any) {
      sent.push({ message, options });
    },
  } as never;
  const stream = createOpenAIResponsesImageStream({
    createResponsesStream: async () => ({
      response: { status: 200, headers: new Headers() },
      data: [
        { type: "response.created", response: { id: "resp_1" } },
        {
          type: "response.output_item.done",
          item: { type: "image_generation_call", id: "ig_1", result: PNG_BASE64 },
        },
        { type: "response.completed", response: { id: "resp_1", status: "completed" } },
      ],
    }),
    persistImage: async (input) => ({
      imageBase64: input.base64,
      path: "/tmp/generated.png",
      mimeType: "image/png",
      bytes: 1,
    }),
  })(model(), { messages: [] } as Context, { apiKey: "key" } as any, pi);

  await collect(stream);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(sent).toHaveLength(0);

  flushGeneratedImageMessages(pi);
  expect(sent[0].message.customType).toBe("openai-generated-image");
  expect(sent[0].message.content).toEqual([
    { type: "text", text: "Generated image: /tmp/generated.png" },
  ]);
  expect(sent[0].message.details).toEqual({
    path: "/tmp/generated.png",
    mimeType: "image/png",
    bytes: 1,
    provider: "openai",
    model: "gpt-5.1",
  });
  expect(sent[0].options).toBeUndefined();
});

test("deferred custom image message failures do not escape after stream completion", async () => {
  let uncaught: unknown;
  const onUncaught = (error: unknown) => {
    uncaught = error;
  };
  process.once("uncaughtException", onUncaught);
  try {
    const events = await collect(
      createOpenAIResponsesImageStream({
        createResponsesStream: async () => ({
          response: { status: 200, headers: new Headers() },
          data: [
            {
              type: "response.output_item.done",
              item: { type: "image_generation_call", id: "ig_1", result: PNG_BASE64 },
            },
            { type: "response.completed", response: { id: "resp_1", status: "completed" } },
          ],
        }),
        persistImage: async (input) => ({
          imageBase64: input.base64,
          path: "/tmp/generated.png",
          mimeType: "image/png",
        }),
      })(
        model(),
        { messages: [] } as Context,
        { apiKey: "key" } as any,
        {
          sendMessage() {
            throw new Error("send failed");
          },
        } as never,
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.at(-1).type).toBe("done");
    expect(uncaught).toBeUndefined();
  } finally {
    process.removeListener("uncaughtException", onUncaught);
  }
});

test("streamSimple throws synchronously when API key is missing", () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    expect(() =>
      streamSimpleOpenAIResponsesWithImages(
        model({ provider: "missing-provider" }),
        { messages: [] } as Context,
        undefined,
        {} as never,
      ),
    ).toThrow("No API key for provider: missing-provider");
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("streamSimple wrapper forwards service tier and reasoning summary", async () => {
  const options = buildOpenAIResponsesSimpleOptions(
    model(),
    { apiKey: "key", serviceTier: "priority", reasoningSummary: "detailed" } as any,
    "key",
  );

  expect(options.serviceTier).toBe("priority");
  expect(options.reasoningSummary).toBe("detailed");
});

test("streamSimple wrapper clamps unsupported xhigh reasoning", async () => {
  const options = buildOpenAIResponsesSimpleOptions(
    model({ thinkingLevelMap: { xhigh: null } }),
    { apiKey: "key", reasoning: "xhigh" } as any,
    "key",
  );

  expect(options.reasoningEffort).toBe("high");
});

test("stream wrapper preserves start event when onResponse aborts", async () => {
  const controller = new AbortController();
  const events = await collect(
    createOpenAIResponsesImageStream({
      createResponsesStream: async () => ({
        response: { status: 200, headers: new Headers() },
        data: [],
      }),
    })(
      model(),
      { messages: [] } as Context,
      {
        apiKey: "key",
        signal: controller.signal,
        onResponse: async () => controller.abort(),
      } as any,
      {} as never,
    ),
  );

  expect(events[0].type).toBe("start");
  expect(events.at(-1).type).toBe("error");
  expect(events.at(-1).reason).toBe("aborted");
});

test("stream wrapper emits start before content and done with final assistant message", async () => {
  const events = await collect(
    createOpenAIResponsesImageStream({
      createResponsesStream: async () => ({
        response: { status: 200, headers: new Headers() },
        data: [
          {
            type: "response.output_item.added",
            item: { type: "message", id: "msg_1", content: [] },
          },
          { type: "response.content_part.added", part: { type: "output_text", text: "" } },
          { type: "response.output_text.delta", delta: "hello" },
          {
            type: "response.output_item.done",
            item: {
              type: "message",
              id: "msg_1",
              content: [{ type: "output_text", text: "hello" }],
            },
          },
          { type: "response.completed", response: { id: "resp_1", status: "completed" } },
        ],
      }),
    })(model(), { messages: [] } as Context, { apiKey: "key" } as any, {} as never),
  );

  expect(events[0].type).toBe("start");
  expect(events.some((event) => event.type === "text_delta")).toBe(true);
  expect(events.at(-1).type).toBe("done");
  expect(events.at(-1).message.content[0].text).toBe("hello");
});

test("stream wrapper emits error when responses stream fails", async () => {
  const events = await collect(
    createOpenAIResponsesImageStream({
      createResponsesStream: async () => {
        throw new Error("network down");
      },
    })(model(), { messages: [] } as Context, { apiKey: "key" } as any, {} as never),
  );

  expect(events[0].type).toBe("error");
  expect(events[0].reason).toBe("error");
  expect(events[0].error.errorMessage).toBe("network down");
});

test("stream wrapper maps aborted signal to aborted stop reason", async () => {
  const controller = new AbortController();
  controller.abort();
  const events = await collect(
    createOpenAIResponsesImageStream({
      createResponsesStream: async () => ({
        response: { status: 200, headers: new Headers() },
        data: [],
      }),
    })(
      model(),
      { messages: [] } as Context,
      { apiKey: "key", signal: controller.signal } as any,
      {} as never,
    ),
  );

  expect(events[0].type).toBe("start");
  expect(events.at(-1).type).toBe("error");
  expect(events.at(-1).reason).toBe("aborted");
});

test("stream wrapper applies payload and response hooks", async () => {
  let receivedParams: any;
  let responseStatus: number | undefined;
  await collect(
    createOpenAIResponsesImageStream({
      createResponsesStream: async ({ params }) => {
        receivedParams = params;
        return { response: { status: 202, headers: new Headers([["x-test", "yes"]]) }, data: [] };
      },
    })(
      model(),
      { messages: [] } as Context,
      {
        apiKey: "key",
        onPayload: async (params: any) => ({ ...params, model: "rewritten" }),
        onResponse: async (response: any) => {
          responseStatus = response.status;
          expect(response.headers["x-test"]).toBe("yes");
        },
      } as any,
      {} as never,
    ),
  );

  expect(receivedParams.model).toBe("rewritten");
  expect(responseStatus).toBe(202);
});
