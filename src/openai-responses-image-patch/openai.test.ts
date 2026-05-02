import { expect, test } from "bun:test";
import type { Context, Model } from "@mariozechner/pi-ai";

import {
  buildOpenAIResponsesClientConfig,
  buildOpenAIResponsesParams,
  convertResponsesMessages,
  convertResponsesTools,
} from "./openai.ts";

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

function context(overrides: Partial<Context> = {}): Context {
  return { messages: [], ...overrides } as Context;
}

test("buildOpenAIResponsesParams sets model, input, streaming, store, and tools", () => {
  const params = buildOpenAIResponsesParams(
    model({ reasoning: false }),
    context({
      messages: [{ role: "user", content: "hello", timestamp: 1 }],
      tools: [{ name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} } as any }],
    }),
    { sessionId: "sess" } as any,
  );

  expect(params.model).toBe("gpt-5.1");
  expect(params.stream).toBe(true);
  expect(params.store).toBe(false);
  expect(params.prompt_cache_key).toBe("sess");
  expect(params.input![0]).toEqual({ role: "user", content: [{ type: "input_text", text: "hello" }] });
  expect(params.tools?.[0]).toMatchObject({ type: "function", name: "lookup", strict: false });
});

test("buildOpenAIResponsesParams includes encrypted reasoning when requested", () => {
  const params = buildOpenAIResponsesParams(model(), context(), {
    reasoningEffort: "high",
    reasoningSummary: "detailed",
  } as any);

  expect(params.reasoning).toEqual({ effort: "high", summary: "detailed" });
  expect(params.include).toEqual(["reasoning.encrypted_content"]);
});

test("buildOpenAIResponsesParams applies model thinking level mappings", () => {
  const params = buildOpenAIResponsesParams(
    model({ thinkingLevelMap: { high: "max" } }),
    context(),
    { reasoningEffort: "high" } as any,
  );

  expect(params.reasoning).toEqual({ effort: "max", summary: "auto" });
});

test("buildOpenAIResponsesParams disables reasoning by default except github-copilot", () => {
  expect(buildOpenAIResponsesParams(model(), context(), undefined).reasoning).toEqual({ effort: "none" });
  expect(buildOpenAIResponsesParams(model({ provider: "github-copilot" }), context(), undefined).reasoning).toBeUndefined();
});

test("buildOpenAIResponsesParams omits default reasoning when the model cannot turn thinking off", () => {
  expect(
    buildOpenAIResponsesParams(model({ thinkingLevelMap: { off: null } }), context(), undefined).reasoning,
  ).toBeUndefined();
});

test("buildOpenAIResponsesClientConfig preserves headers and Copilot dynamic headers", () => {
  const config = buildOpenAIResponsesClientConfig(
    model({ provider: "github-copilot", headers: { existing: "1" } }),
    context({ messages: [{ role: "user", content: [{ type: "image", data: "abc", mimeType: "image/png" }], timestamp: 1 }] }),
    { apiKey: "key", sessionId: "sess", headers: { existing: "2", extra: "3" } } as any,
  );

  expect(config.apiKey).toBe("key");
  expect(config.defaultHeaders).toMatchObject({
    existing: "2",
    extra: "3",
    session_id: "sess",
    "x-client-request-id": "sess",
    "X-Initiator": "user",
    "Openai-Intent": "conversation-edits",
    "Copilot-Vision-Request": "true",
  });
});

test("convertResponsesMessages preserves signatures, tool ids, and tool-result images", () => {
  const messages = convertResponsesMessages(
    model(),
    context({
      messages: [
        {
          role: "assistant",
          api: "openai-responses",
          provider: "openai",
          model: "gpt-5.1",
          content: [
            { type: "thinking", thinking: "", thinkingSignature: JSON.stringify({ type: "reasoning", id: "rs_1" }) },
            { type: "text", text: "hi", textSignature: JSON.stringify({ v: 1, id: "msg_1", phase: "final_answer" }) },
            { type: "toolCall", id: "call_1|fc_1", name: "lookup", arguments: { x: 1 } },
          ],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "toolUse",
          timestamp: 1,
        },
        {
          role: "toolResult",
          toolCallId: "call_1|fc_1",
          toolName: "lookup",
          content: [{ type: "image", data: "abc", mimeType: "image/png" }],
          isError: false,
          timestamp: 2,
        },
      ],
    }),
    new Set(["openai", "openai-codex", "opencode"]),
  );

  expect(messages[0]).toEqual({ type: "reasoning", id: "rs_1" });
  expect(messages[1]).toMatchObject({ type: "message", id: "msg_1", phase: "final_answer" });
  expect(messages[2]).toMatchObject({ type: "function_call", id: "fc_1", call_id: "call_1" });
  expect(messages[3]).toMatchObject({ type: "function_call_output", call_id: "call_1" });
  expect((messages[3] as any).output[0]).toMatchObject({ type: "input_image", image_url: "data:image/png;base64,abc" });
});

test("convertResponsesTools defaults strict to false", () => {
  expect(convertResponsesTools([{ name: "lookup", description: "Lookup", parameters: {} as any }])[0]).toMatchObject({
    type: "function",
    strict: false,
  });
});

test("convertResponsesMessages replays generated image calls for image-capable models", () => {
  const messages = convertResponsesMessages(
    model(),
    context({
      messages: [
        {
          role: "assistant",
          api: "openai-responses",
          provider: "openai",
          model: "gpt-5.1",
          content: [
            {
              type: "imageGeneration",
              id: "ig_123",
              status: "completed",
              revisedPrompt: "lobster",
              result: "Zm9v",
            },
          ],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: 1,
        } as any,
      ],
    }),
  );

  expect(messages).toEqual([
    {
      type: "image_generation_call",
      id: "ig_123",
      status: "completed",
      revised_prompt: "lobster",
      result: "Zm9v",
    },
  ]);
});

test("convertResponsesMessages strips generated image bytes for text-only models", () => {
  const messages = convertResponsesMessages(
    model({ input: ["text"] }),
    context({
      messages: [
        {
          role: "assistant",
          api: "openai-responses",
          provider: "openai",
          model: "gpt-5.1",
          content: [
            {
              type: "imageGeneration",
              id: "ig_123",
              status: "completed",
              revisedPrompt: "lobster",
              result: "Zm9v",
            },
          ],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: 1,
        } as any,
      ],
    }),
  );

  expect(messages).toEqual([
    {
      type: "image_generation_call",
      id: "ig_123",
      status: "completed",
      revised_prompt: "lobster",
      result: "",
    },
  ]);
});
