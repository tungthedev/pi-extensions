// Vendored from @mariozechner/pi-ai 0.70.0 openai-responses provider because
// openai-responses-shared.js is not exported as a public package subpath.
import crypto from "node:crypto";

import { getEnvApiKey, type Context, type Model, type Tool, type Usage } from "@mariozechner/pi-ai";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses.js";

import type { GeneratedImageContent } from "./types.ts";

const OPENAI_TOOL_CALL_PROVIDERS = new Set(["openai", "openai-codex", "opencode"]);

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sanitizeSurrogates(value: string): string {
  return value.replace(/[\uD800-\uDFFF]/g, "\uFFFD");
}

function parseTextSignature(signature: string | undefined): { id: string; phase?: "commentary" | "final_answer" } | undefined {
  if (!signature) return undefined;
  if (signature.startsWith("{")) {
    try {
      const parsed = JSON.parse(signature);
      if (parsed.v === 1 && typeof parsed.id === "string") {
        if (parsed.phase === "commentary" || parsed.phase === "final_answer") return { id: parsed.id, phase: parsed.phase };
        return { id: parsed.id };
      }
    } catch {}
  }
  return { id: signature };
}

function replaceImagesWithPlaceholder(content: any[], placeholder: string): any[] {
  const result: any[] = [];
  let previousWasPlaceholder = false;
  for (const block of content) {
    if (block.type === "image") {
      if (!previousWasPlaceholder) result.push({ type: "text", text: placeholder });
      previousWasPlaceholder = true;
      continue;
    }
    result.push(block);
    previousWasPlaceholder = block.text === placeholder;
  }
  return result;
}

function transformMessages(messages: any[], model: Model<any>, normalizeToolCallId?: (id: string, target: Model<any>, source: any) => string): any[] {
  const imageAwareMessages = model.input.includes("image")
    ? messages
    : messages.map((msg) => {
      if (msg.role === "user" && Array.isArray(msg.content)) {
        return { ...msg, content: replaceImagesWithPlaceholder(msg.content, "(image omitted: model does not support images)") };
      }
      if (msg.role === "toolResult") {
        return { ...msg, content: replaceImagesWithPlaceholder(msg.content, "(tool image omitted: model does not support images)") };
      }
      return msg;
    });
  const toolCallIdMap = new Map<string, string>();
  const transformed = imageAwareMessages.map((msg) => {
    if (msg.role === "user") return msg;
    if (msg.role === "toolResult") {
      const normalizedId = toolCallIdMap.get(msg.toolCallId);
      return normalizedId && normalizedId !== msg.toolCallId ? { ...msg, toolCallId: normalizedId } : msg;
    }
    if (msg.role !== "assistant") return msg;

    const isSameModel = msg.provider === model.provider && msg.api === model.api && msg.model === model.id;
    const content = msg.content.flatMap((block: any) => {
      if (block.type === "thinking") {
        if (block.redacted) return isSameModel ? block : [];
        if (isSameModel && block.thinkingSignature) return block;
        if (!block.thinking?.trim()) return [];
        return isSameModel ? block : { type: "text", text: block.thinking };
      }
      if (block.type === "text") return isSameModel ? block : { type: "text", text: block.text };
      if (block.type !== "toolCall") return block;
      let normalizedToolCall = block;
      if (!isSameModel && block.thoughtSignature) {
        normalizedToolCall = { ...block };
        delete normalizedToolCall.thoughtSignature;
      }
      if (!isSameModel && normalizeToolCallId) {
        const normalizedId = normalizeToolCallId(block.id, model, msg);
        if (normalizedId !== block.id) {
          toolCallIdMap.set(block.id, normalizedId);
          normalizedToolCall = { ...normalizedToolCall, id: normalizedId };
        }
      }
      return normalizedToolCall;
    });
    return { ...msg, content };
  });

  const result: any[] = [];
  let pendingToolCalls: any[] = [];
  let existingToolResultIds = new Set<string>();
  const insertSyntheticToolResults = () => {
    for (const toolCall of pendingToolCalls) {
      if (!existingToolResultIds.has(toolCall.id)) {
        result.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: "No result provided" }],
          isError: true,
          timestamp: Date.now(),
        });
      }
    }
    pendingToolCalls = [];
    existingToolResultIds = new Set();
  };

  for (const msg of transformed) {
    if (msg.role === "assistant") {
      insertSyntheticToolResults();
      if (msg.stopReason === "error" || msg.stopReason === "aborted") continue;
      pendingToolCalls = msg.content.filter((block: any) => block.type === "toolCall");
      existingToolResultIds = new Set();
      result.push(msg);
    } else if (msg.role === "toolResult") {
      existingToolResultIds.add(msg.toolCallId);
      result.push(msg);
    } else if (msg.role === "user") {
      insertSyntheticToolResults();
      result.push(msg);
    } else {
      result.push(msg);
    }
  }
  insertSyntheticToolResults();
  return result;
}

export function convertResponsesMessages(
  model: Model<any>,
  context: Context,
  allowedToolCallProviders: ReadonlySet<string> = OPENAI_TOOL_CALL_PROVIDERS,
  options?: { includeSystemPrompt?: boolean },
): any[] {
  const messages: any[] = [];
  const normalizeIdPart = (part: string): string => {
    const sanitized = part.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalized = sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
    return normalized.replace(/_+$/, "");
  };
  const buildForeignResponsesItemId = (itemId: string): string => {
    const normalized = `fc_${shortHash(itemId)}`;
    return normalized.length > 64 ? normalized.slice(0, 64) : normalized;
  };
  const normalizeToolCallId = (id: string, _targetModel: Model<any>, source: any): string => {
    if (!allowedToolCallProviders.has(model.provider)) return normalizeIdPart(id);
    if (!id.includes("|")) return normalizeIdPart(id);
    const [callId, itemId] = id.split("|");
    const isForeignToolCall = source.provider !== model.provider || source.api !== model.api;
    let normalizedItemId = isForeignToolCall ? buildForeignResponsesItemId(itemId) : normalizeIdPart(itemId);
    if (!normalizedItemId.startsWith("fc_")) normalizedItemId = normalizeIdPart(`fc_${normalizedItemId}`);
    return `${normalizeIdPart(callId)}|${normalizedItemId}`;
  };

  if ((options?.includeSystemPrompt ?? true) && context.systemPrompt) {
    messages.push({ role: model.reasoning ? "developer" : "system", content: sanitizeSurrogates(context.systemPrompt) });
  }

  let msgIndex = 0;
  for (const msg of transformMessages(context.messages, model, normalizeToolCallId)) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        messages.push({ role: "user", content: [{ type: "input_text", text: sanitizeSurrogates(msg.content) }] });
      } else {
        const content = msg.content.map((item: any) => item.type === "text"
          ? { type: "input_text", text: sanitizeSurrogates(item.text) }
          : { type: "input_image", detail: "auto", image_url: `data:${item.mimeType};base64,${item.data}` });
        if (content.length > 0) messages.push({ role: "user", content });
      }
    } else if (msg.role === "assistant") {
      const output: any[] = [];
      const isDifferentModel = msg.model !== model.id && msg.provider === model.provider && msg.api === model.api;
      for (const block of msg.content) {
        if (block.type === "thinking") {
          if (block.thinkingSignature) output.push(JSON.parse(block.thinkingSignature));
        } else if (block.type === "text") {
          const parsedSignature = parseTextSignature(block.textSignature);
          let msgId = parsedSignature?.id;
          if (!msgId) msgId = `msg_${msgIndex}`;
          else if (msgId.length > 64) msgId = `msg_${shortHash(msgId)}`;
          output.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: sanitizeSurrogates(block.text), annotations: [] }],
            status: "completed",
            id: msgId,
            phase: parsedSignature?.phase,
          });
        } else if (block.type === "toolCall") {
          const [callId, itemIdRaw] = block.id.split("|");
          let itemId = itemIdRaw;
          if (isDifferentModel && itemId?.startsWith("fc_")) itemId = undefined;
          output.push({ type: "function_call", id: itemId, call_id: callId, name: block.name, arguments: JSON.stringify(block.arguments) });
        } else if (block.type === "imageGeneration") {
          const image = block as GeneratedImageContent;
          const item: any = {
            type: "image_generation_call",
            id: image.id,
            status: image.status,
            result: model.input.includes("image") ? image.result : "",
          };
          if (image.revisedPrompt !== undefined) item.revised_prompt = image.revisedPrompt;
          output.push(item);
        }
      }
      if (output.length > 0) messages.push(...output);
    } else if (msg.role === "toolResult") {
      const textResult = msg.content.filter((content: any) => content.type === "text").map((content: any) => content.text).join("\n");
      const hasImages = msg.content.some((content: any) => content.type === "image");
      const [callId] = msg.toolCallId.split("|");
      let output: any = sanitizeSurrogates(textResult.length > 0 ? textResult : "(see attached image)");
      if (hasImages && model.input.includes("image")) {
        output = [];
        if (textResult.length > 0) output.push({ type: "input_text", text: sanitizeSurrogates(textResult) });
        for (const block of msg.content) {
          if (block.type === "image") output.push({ type: "input_image", detail: "auto", image_url: `data:${block.mimeType};base64,${block.data}` });
        }
      }
      messages.push({ type: "function_call_output", call_id: callId, output });
    }
    msgIndex++;
  }
  return messages;
}

export function convertResponsesTools(tools: Tool[], options?: { strict?: boolean | null }): any[] {
  const strict = options?.strict === undefined ? false : options.strict;
  return tools.map((tool) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters, strict }));
}

function resolveCacheRetention(cacheRetention?: "none" | "short" | "long"): "none" | "short" | "long" {
  if (cacheRetention) return cacheRetention;
  return process.env.PI_CACHE_RETENTION === "long" ? "long" : "short";
}

function getCompat(model: Model<any>): { sendSessionIdHeader: boolean; supportsLongCacheRetention: boolean } {
  return {
    sendSessionIdHeader: (model.compat as any)?.sendSessionIdHeader ?? true,
    supportsLongCacheRetention: (model.compat as any)?.supportsLongCacheRetention ?? true,
  };
}

function getPromptCacheRetention(compat: { supportsLongCacheRetention: boolean }, cacheRetention: string): "24h" | undefined {
  return cacheRetention === "long" && compat.supportsLongCacheRetention ? "24h" : undefined;
}

function hasCopilotVisionInput(messages: any[]): boolean {
  return messages.some((msg) => (msg.role === "user" || msg.role === "toolResult") && Array.isArray(msg.content)
    ? msg.content.some((content: any) => content.type === "image")
    : false);
}

function buildCopilotDynamicHeaders(messages: any[]): Record<string, string> {
  const last = messages[messages.length - 1];
  const headers: Record<string, string> = {
    "X-Initiator": last && last.role !== "user" ? "agent" : "user",
    "Openai-Intent": "conversation-edits",
  };
  if (hasCopilotVisionInput(messages)) headers["Copilot-Vision-Request"] = "true";
  return headers;
}

export function buildOpenAIResponsesParams(
  model: Model<"openai-responses">,
  context: Context,
  options?: any,
): ResponseCreateParamsStreaming {
  const cacheRetention = resolveCacheRetention(options?.cacheRetention);
  const compat = getCompat(model);
  const params: any = {
    model: model.id,
    input: convertResponsesMessages(model, context, OPENAI_TOOL_CALL_PROVIDERS),
    stream: true,
    prompt_cache_key: cacheRetention === "none" ? undefined : options?.sessionId,
    prompt_cache_retention: getPromptCacheRetention(compat, cacheRetention),
    store: false,
  };
  if (options?.maxTokens) params.max_output_tokens = options.maxTokens;
  if (options?.temperature !== undefined) params.temperature = options.temperature;
  if (options?.serviceTier !== undefined) params.service_tier = options.serviceTier;
  if (context.tools) params.tools = convertResponsesTools(context.tools);
  if (model.reasoning) {
    if (options?.reasoningEffort || options?.reasoningSummary) {
      params.reasoning = { effort: options?.reasoningEffort || "medium", summary: options?.reasoningSummary || "auto" };
      params.include = ["reasoning.encrypted_content"];
    } else if (model.provider !== "github-copilot") {
      params.reasoning = { effort: "none" };
    }
  }
  return params;
}

export function buildOpenAIResponsesClientConfig(
  model: Model<"openai-responses">,
  context: Context,
  options?: any,
): { apiKey: string; baseURL?: string; defaultHeaders: Record<string, string> } {
  const apiKey = options?.apiKey || getEnvApiKey(model.provider) || "";
  const cacheRetention = resolveCacheRetention(options?.cacheRetention);
  const sessionId = cacheRetention === "none" ? undefined : options?.sessionId;
  const headers: Record<string, string> = { ...(model.headers as Record<string, string> | undefined) };
  if (model.provider === "github-copilot") Object.assign(headers, buildCopilotDynamicHeaders(context.messages));
  if (sessionId) {
    if (getCompat(model).sendSessionIdHeader) headers.session_id = sessionId;
    headers["x-client-request-id"] = sessionId;
  }
  if (options?.headers) Object.assign(headers, options.headers);
  return { apiKey, baseURL: model.baseUrl, defaultHeaders: headers };
}

function getServiceTierCostMultiplier(model: Model<any>, serviceTier: string | undefined): number {
  if (serviceTier === "flex") return 0.5;
  if (serviceTier === "priority") return model.id === "gpt-5.5" ? 2.5 : 2;
  return 1;
}

export function applyOpenAIServiceTierPricing(usage: Usage, serviceTier: string | undefined, model: Model<any>): void {
  const multiplier = getServiceTierCostMultiplier(model, serviceTier);
  if (multiplier === 1) return;
  usage.cost.input *= multiplier;
  usage.cost.output *= multiplier;
  usage.cost.cacheRead *= multiplier;
  usage.cost.cacheWrite *= multiplier;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
