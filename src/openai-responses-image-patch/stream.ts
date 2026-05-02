import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  clampThinkingLevel,
  createAssistantMessageEventStream,
  getEnvApiKey,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import OpenAI from "openai";

import type { GeneratedImageDetails, GeneratedImageParserInput } from "./types.ts";

import { persistGeneratedPng } from "./images.ts";
import {
  applyOpenAIServiceTierPricing,
  buildOpenAIResponsesClientConfig,
  buildOpenAIResponsesParams,
} from "./openai.ts";
import { GENERATED_IMAGE_CUSTOM_TYPE } from "./render.ts";
import { processResponsesStreamWithImages } from "./responses-parser.ts";

type ResponsesStreamResult = {
  response: { status: number; headers: Headers };
  data: AsyncIterable<any> | Iterable<any>;
};

const pendingGeneratedImageMessages: GeneratedImageDetails[] = [];

export interface OpenAIResponsesImageStreamDeps {
  createResponsesStream?: (input: {
    model: Model<"openai-responses">;
    context: Context;
    options: any;
    params: any;
    clientConfig: ReturnType<typeof buildOpenAIResponsesClientConfig>;
  }) => Promise<ResponsesStreamResult>;
  persistImage?: (input: GeneratedImageParserInput) => Promise<GeneratedImageDetails>;
}

function sendGeneratedImageMessage(pi: ExtensionAPI, details: GeneratedImageDetails): void {
  const { imageBase64: _imageBase64, ...displayDetails } = details;
  pi.sendMessage({
    customType: GENERATED_IMAGE_CUSTOM_TYPE,
    display: true,
    content: [{ type: "text", text: `Generated image: ${details.path ?? "not written to disk"}` }],
    details: displayDetails,
  } as never);
}

export function queueGeneratedImageMessage(details: GeneratedImageDetails): void {
  pendingGeneratedImageMessages.push(details);
}

export function flushGeneratedImageMessages(pi: ExtensionAPI): void {
  const pending = pendingGeneratedImageMessages.splice(0);
  for (const details of pending) {
    sendGeneratedImageMessage(pi, details);
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function createOutput(model: Model<"openai-responses">): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
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

function cleanupStreamingScratch(output: AssistantMessage): void {
  for (const block of output.content as any[]) {
    delete block.index;
    delete block.partialJson;
  }
}

async function defaultCreateResponsesStream(input: {
  clientConfig: ReturnType<typeof buildOpenAIResponsesClientConfig>;
  params: any;
  options: any;
}): Promise<ResponsesStreamResult> {
  const client = new OpenAI({
    apiKey: input.clientConfig.apiKey,
    baseURL: input.clientConfig.baseURL,
    dangerouslyAllowBrowser: true,
    defaultHeaders: input.clientConfig.defaultHeaders,
  });
  return client.responses
    .create(input.params, input.options?.signal ? { signal: input.options.signal } : undefined)
    .withResponse() as any;
}

export function createOpenAIResponsesImageStream(deps: OpenAIResponsesImageStreamDeps = {}) {
  const createResponsesStream = deps.createResponsesStream ?? defaultCreateResponsesStream;
  const persistImage = deps.persistImage ?? persistGeneratedPng;

  return function streamOpenAIResponsesWithImages(
    model: Model<"openai-responses">,
    context: Context,
    options: any,
    _pi: ExtensionAPI,
  ): AssistantMessageEventStream {
    const stream = createAssistantMessageEventStream();
    const output = createOutput(model);

    (async () => {
      try {
        const clientConfig = buildOpenAIResponsesClientConfig(model, context, options);
        if (!clientConfig.apiKey) throw new Error(`No API key for provider: ${model.provider}`);

        let params = buildOpenAIResponsesParams(model, context, options);
        const nextParams = await options?.onPayload?.(params, model);
        if (nextParams !== undefined) params = nextParams;

        const { data, response } = await createResponsesStream({
          model,
          context,
          options,
          params,
          clientConfig,
        });
        await options?.onResponse?.(
          { status: response.status, headers: headersToRecord(response.headers) },
          model,
        );

        stream.push({ type: "start", partial: output });
        await processResponsesStreamWithImages(data as AsyncIterable<any>, output, stream, model, {
          serviceTier: options?.serviceTier,
          applyServiceTierPricing: (usage, serviceTier) =>
            applyOpenAIServiceTierPricing(usage, serviceTier, model),
          onImage: async (image) => {
            const details = await persistImage(image);
            const mergedDetails = { ...details, provider: model.provider, model: model.id };
            queueGeneratedImageMessage(mergedDetails);
            return mergedDetails;
          },
        });

        if (options?.signal?.aborted) throw new Error("Request was aborted");
        if (output.stopReason === "aborted" || output.stopReason === "error")
          throw new Error("An unknown error occurred");
        cleanupStreamingScratch(output);
        stream.push({ type: "done", reason: output.stopReason, message: output });
        stream.end();
      } catch (error) {
        cleanupStreamingScratch(output);
        output.stopReason = options?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        stream.push({ type: "error", reason: output.stopReason, error: output });
        stream.end();
      }
    })();

    return stream;
  };
}

export function buildOpenAIResponsesSimpleOptions(
  model: Model<"openai-responses">,
  options: (SimpleStreamOptions & any) | undefined,
  apiKey: string,
): any {
  return {
    temperature: options?.temperature,
    maxTokens:
      options?.maxTokens ?? (model.maxTokens > 0 ? Math.min(model.maxTokens, 32000) : undefined),
    signal: options?.signal,
    apiKey: apiKey || options?.apiKey,
    cacheRetention: options?.cacheRetention,
    sessionId: options?.sessionId,
    headers: options?.headers,
    onPayload: options?.onPayload,
    onResponse: options?.onResponse,
    reasoningSummary: options?.reasoningSummary,
    reasoningEffort: options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined,
    serviceTier: options?.serviceTier,
    maxRetryDelayMs: (options as any)?.maxRetryDelayMs,
    metadata: (options as any)?.metadata,
  };
}

export function streamSimpleOpenAIResponsesWithImages(
  model: Model<"openai-responses">,
  context: Context,
  options: SimpleStreamOptions | undefined,
  pi: ExtensionAPI,
): AssistantMessageEventStream {
  const apiKey = options?.apiKey || getEnvApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`No API key for provider: ${model.provider}`);
  }
  const base = buildOpenAIResponsesSimpleOptions(model, options, apiKey);
  return createOpenAIResponsesImageStream()(model, context, base, pi);
}
