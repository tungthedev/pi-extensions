import { expect, test } from "bun:test";
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@mariozechner/pi-ai";

import { processResponsesStreamWithImages } from "./responses-parser.ts";

function model(): Model<"openai-responses"> {
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
  };
}

function output(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-5.1",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

async function collect(stream: AsyncIterable<any>) {
  const events: any[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

async function run(events: any[], options: any = {}) {
  const stream = createAssistantMessageEventStream();
  const done = collect(stream);
  const assistant = output();
  await processResponsesStreamWithImages(events as never, assistant, stream, model(), options);
  stream.end();
  return { events: await done, assistant };
}

test("processes image_generation_call into callback and hidden assistant image state", async () => {
  const saved: any[] = [];
  const { events, assistant } = await run(
    [
      { type: "response.created", response: { id: "resp_1" } },
      { type: "response.output_item.added", item: { type: "image_generation_call", id: "ig_1" } },
      {
        type: "response.output_item.done",
        item: { type: "image_generation_call", id: "ig_1", result: "abc", revised_prompt: "rev" },
      },
      { type: "response.completed", response: { id: "resp_1", status: "completed" } },
    ],
    {
      onImage: async (image: any) => {
        saved.push(image);
        return {
          imageBase64: image.base64,
          path: "/tmp/generated.png",
          mimeType: "image/png",
          bytes: 1,
          responseId: image.responseId,
          itemId: image.itemId,
          revisedPrompt: image.revisedPrompt,
        };
      },
    },
  );

  expect(saved).toHaveLength(1);
  expect(saved[0].base64).toBe("abc");
  expect(saved[0].responseId).toBe("resp_1");
  expect((assistant.content[0] as any).type).toBe("imageGeneration");
  expect((assistant.content[0] as any).id).toBe("ig_1");
  expect((assistant.content[0] as any).result).toBe("abc");
  expect((assistant.content[0] as any).revisedPrompt).toBe("rev");
  expect((assistant.content[0] as any).path).toBe("/tmp/generated.png");
  expect(events.some((event) => event.type === "text_end" && event.content.includes("/tmp/generated.png"))).toBe(false);
});

test("finalizes function calls with parsed arguments", async () => {
  const { events, assistant } = await run([
    {
      type: "response.output_item.added",
      item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "make", arguments: "" },
    },
    { type: "response.function_call_arguments.delta", delta: '{"x"' },
    { type: "response.function_call_arguments.done", arguments: '{"x":1}' },
    {
      type: "response.output_item.done",
      item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "make", arguments: '{"x":1}' },
    },
  ]);

  const end = events.find((event) => event.type === "toolcall_end");
  expect(end.toolCall.arguments).toEqual({ x: 1 });
  expect((assistant.content[0] as any).partialJson).toBeUndefined();
});

test("streams refusal and reasoning summary content", async () => {
  const { events } = await run([
    { type: "response.output_item.added", item: { type: "reasoning", id: "rs_1", summary: [] } },
    { type: "response.reasoning_summary_part.added", part: { type: "summary_text", text: "" } },
    { type: "response.reasoning_summary_text.delta", delta: "thinking" },
    { type: "response.reasoning_summary_part.done" },
    { type: "response.output_item.done", item: { type: "reasoning", id: "rs_1", summary: [{ text: "thinking" }] } },
    { type: "response.output_item.added", item: { type: "message", id: "msg_1", content: [] } },
    { type: "response.content_part.added", part: { type: "refusal", refusal: "" } },
    { type: "response.refusal.delta", delta: "no" },
    { type: "response.output_item.done", item: { type: "message", id: "msg_1", content: [{ type: "refusal", refusal: "no" }] } },
  ]);

  expect(events.some((event) => event.type === "thinking_end" && event.content === "thinking")).toBe(true);
  expect(events.some((event) => event.type === "text_end" && event.content === "no")).toBe(true);
});

test("throws provider response failure messages", async () => {
  const stream = createAssistantMessageEventStream();
  await expect(
    processResponsesStreamWithImages(
      [{ type: "response.failed", response: { error: { code: "bad", message: "broken" } } }] as never,
      output(),
      stream,
      model(),
    ),
  ).rejects.toThrow("bad: broken");
  stream.end();
});

test("mixed stream preserves usage without generated image text", async () => {
  const { events, assistant } = await run(
    [
      { type: "response.output_item.added", item: { type: "message", id: "msg_1", content: [] } },
      { type: "response.content_part.added", part: { type: "output_text", text: "" } },
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.output_item.done", item: { type: "message", id: "msg_1", content: [{ type: "output_text", text: "hello" }] } },
      { type: "response.output_item.done", item: { type: "image_generation_call", id: "ig_1", result: "abc" } },
      {
        type: "response.completed",
        response: {
          id: "resp_1",
          status: "completed",
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 3 } },
        },
      },
    ],
    { onImage: async () => ({ imageBase64: "abc", path: "/tmp/generated.png", mimeType: "image/png" }) },
  );

  expect(events.filter((event) => event.type === "text_end")).toHaveLength(1);
  expect(events.some((event) => event.type === "text_end" && event.content.includes("/tmp/generated.png"))).toBe(false);
  expect(assistant.usage.input).toBe(7);
  expect(assistant.usage.cacheRead).toBe(3);
  expect(assistant.responseId).toBe("resp_1");
});

test("missing image result emits failure text", async () => {
  const { events } = await run([{ type: "response.output_item.done", item: { type: "image_generation_call", id: "ig_1" } }]);

  expect(events.some((event) => event.type === "text_end" && event.content.includes("Generated image failed"))).toBe(true);
});
