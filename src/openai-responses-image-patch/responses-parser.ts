import {
  calculateCost,
  parseStreamingJson,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type StopReason,
} from "@mariozechner/pi-ai";

import type { GeneratedImageContent, ImageAwareParserOptions } from "./types.ts";

function encodeTextSignatureV1(id: string, phase?: "commentary" | "final_answer"): string {
  const payload: { v: 1; id: string; phase?: "commentary" | "final_answer" } = { v: 1, id };
  if (phase) payload.phase = phase;
  return JSON.stringify(payload);
}

function blockIndex(output: AssistantMessage): number {
  return output.content.length - 1;
}

function pushTextBlock(stream: AssistantMessageEventStream, output: AssistantMessage, text: string): void {
  const block = { type: "text" as const, text };
  output.content.push(block);
  const contentIndex = blockIndex(output);
  stream.push({ type: "text_start", contentIndex, partial: output });
  stream.push({ type: "text_delta", contentIndex, delta: text, partial: output });
  stream.push({ type: "text_end", contentIndex, content: text, partial: output });
}

function mapStopReason(status: string | undefined): StopReason {
  switch (status) {
    case undefined:
    case "completed":
    case "in_progress":
    case "queued":
      return "stop";
    case "incomplete":
      return "length";
    case "failed":
    case "cancelled":
      return "error";
    default:
      throw new Error(`Unhandled stop reason: ${status}`);
  }
}

async function handleImageItem(
  item: any,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  model: Model<"openai-responses">,
  options: ImageAwareParserOptions | undefined,
): Promise<void> {
  try {
    if (typeof item.result !== "string" || item.result.length === 0) {
      throw new Error("image_generation_call item had no result");
    }
    const details = await options?.onImage?.({
      base64: item.result,
      responseId: output.responseId,
      itemId: item.id,
      revisedPrompt: item.revised_prompt,
      provider: model.provider,
      model: model.id,
    });
    const imageBlock: GeneratedImageContent = {
      type: "imageGeneration",
      id: item.id,
      status: item.status ?? "completed",
      result: item.result,
      responseId: output.responseId,
      path: details?.path,
      revisedPrompt: item.revised_prompt,
      mimeType: "image/png",
      error: details?.error,
    };
    (output.content as any[]).push(imageBlock);
  } catch (error) {
    pushTextBlock(stream, output, `Generated image failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function processResponsesStreamWithImages(
  openaiStream: AsyncIterable<any>,
  output: AssistantMessage,
  stream: AssistantMessageEventStream,
  model: Model<"openai-responses">,
  options?: ImageAwareParserOptions,
): Promise<void> {
  let currentItem: any = null;
  let currentBlock: any = null;

  for await (const event of openaiStream) {
    if (event.type === "response.created") {
      output.responseId = event.response.id;
    } else if (event.type === "response.output_item.added") {
      const item = event.item;
      if (item.type === "reasoning") {
        currentItem = item;
        currentBlock = { type: "thinking", thinking: "" };
        output.content.push(currentBlock);
        stream.push({ type: "thinking_start", contentIndex: blockIndex(output), partial: output });
      } else if (item.type === "message") {
        currentItem = item;
        currentBlock = { type: "text", text: "" };
        output.content.push(currentBlock);
        stream.push({ type: "text_start", contentIndex: blockIndex(output), partial: output });
      } else if (item.type === "function_call") {
        currentItem = item;
        currentBlock = {
          type: "toolCall",
          id: `${item.call_id}|${item.id}`,
          name: item.name,
          arguments: {},
          partialJson: item.arguments || "",
        };
        output.content.push(currentBlock);
        stream.push({ type: "toolcall_start", contentIndex: blockIndex(output), partial: output });
      } else if (item.type === "image_generation_call") {
        currentItem = item;
      }
    } else if (event.type === "response.reasoning_summary_part.added") {
      if (currentItem?.type === "reasoning") {
        currentItem.summary = currentItem.summary || [];
        currentItem.summary.push(event.part);
      }
    } else if (event.type === "response.reasoning_summary_text.delta") {
      if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
        currentItem.summary = currentItem.summary || [];
        const lastPart = currentItem.summary[currentItem.summary.length - 1];
        if (lastPart) {
          currentBlock.thinking += event.delta;
          lastPart.text += event.delta;
          stream.push({ type: "thinking_delta", contentIndex: blockIndex(output), delta: event.delta, partial: output });
        }
      }
    } else if (event.type === "response.reasoning_summary_part.done") {
      if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
        currentItem.summary = currentItem.summary || [];
        const lastPart = currentItem.summary[currentItem.summary.length - 1];
        if (lastPart) {
          currentBlock.thinking += "\n\n";
          lastPart.text += "\n\n";
          stream.push({ type: "thinking_delta", contentIndex: blockIndex(output), delta: "\n\n", partial: output });
        }
      }
    } else if (event.type === "response.content_part.added") {
      if (currentItem?.type === "message") {
        currentItem.content = currentItem.content || [];
        if (event.part.type === "output_text" || event.part.type === "refusal") currentItem.content.push(event.part);
      }
    } else if (event.type === "response.output_text.delta") {
      if (currentItem?.type === "message" && currentBlock?.type === "text") {
        const lastPart = currentItem.content?.[currentItem.content.length - 1];
        if (lastPart?.type === "output_text") {
          currentBlock.text += event.delta;
          lastPart.text += event.delta;
          stream.push({ type: "text_delta", contentIndex: blockIndex(output), delta: event.delta, partial: output });
        }
      }
    } else if (event.type === "response.refusal.delta") {
      if (currentItem?.type === "message" && currentBlock?.type === "text") {
        const lastPart = currentItem.content?.[currentItem.content.length - 1];
        if (lastPart?.type === "refusal") {
          currentBlock.text += event.delta;
          lastPart.refusal += event.delta;
          stream.push({ type: "text_delta", contentIndex: blockIndex(output), delta: event.delta, partial: output });
        }
      }
    } else if (event.type === "response.function_call_arguments.delta") {
      if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
        currentBlock.partialJson += event.delta;
        currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
        stream.push({ type: "toolcall_delta", contentIndex: blockIndex(output), delta: event.delta, partial: output });
      }
    } else if (event.type === "response.function_call_arguments.done") {
      if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
        const previousPartialJson = currentBlock.partialJson;
        currentBlock.partialJson = event.arguments;
        currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
        if (event.arguments.startsWith(previousPartialJson)) {
          const delta = event.arguments.slice(previousPartialJson.length);
          if (delta.length > 0) {
            stream.push({ type: "toolcall_delta", contentIndex: blockIndex(output), delta, partial: output });
          }
        }
      }
    } else if (event.type === "response.image_generation_call.partial_image") {
      if (currentItem?.type === "image_generation_call") currentItem.partialImage = event.partial_image_b64;
    } else if (event.type === "response.output_item.done") {
      const item = event.item;
      if (item.type === "reasoning" && currentBlock?.type === "thinking") {
        currentBlock.thinking = item.summary?.map((summary: any) => summary.text).join("\n\n") || "";
        currentBlock.thinkingSignature = JSON.stringify(item);
        stream.push({ type: "thinking_end", contentIndex: blockIndex(output), content: currentBlock.thinking, partial: output });
        currentBlock = null;
      } else if (item.type === "message" && currentBlock?.type === "text") {
        currentBlock.text = item.content.map((content: any) => (content.type === "output_text" ? content.text : content.refusal)).join("");
        currentBlock.textSignature = encodeTextSignatureV1(item.id, item.phase ?? undefined);
        stream.push({ type: "text_end", contentIndex: blockIndex(output), content: currentBlock.text, partial: output });
        currentBlock = null;
      } else if (item.type === "function_call") {
        const args = currentBlock?.type === "toolCall" && currentBlock.partialJson
          ? parseStreamingJson(currentBlock.partialJson)
          : parseStreamingJson(item.arguments || "{}");
        const toolCall = currentBlock?.type === "toolCall"
          ? currentBlock
          : { type: "toolCall", id: `${item.call_id}|${item.id}`, name: item.name, arguments: args };
        toolCall.arguments = args;
        delete toolCall.partialJson;
        currentBlock = null;
        stream.push({ type: "toolcall_end", contentIndex: blockIndex(output), toolCall, partial: output });
      } else if (item.type === "image_generation_call") {
        await handleImageItem(item, output, stream, model, options);
        currentItem = null;
      }
    } else if (event.type === "response.completed") {
      const response = event.response;
      if (response?.id) output.responseId = response.id;
      if (response?.usage) {
        const cachedTokens = response.usage.input_tokens_details?.cached_tokens || 0;
        output.usage = {
          input: (response.usage.input_tokens || 0) - cachedTokens,
          output: response.usage.output_tokens || 0,
          cacheRead: cachedTokens,
          cacheWrite: 0,
          totalTokens: response.usage.total_tokens || 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
      }
      calculateCost(model, output.usage);
      if (options?.applyServiceTierPricing) {
        const serviceTier = options.resolveServiceTier
          ? options.resolveServiceTier(response?.service_tier, options.serviceTier)
          : (response?.service_tier ?? options.serviceTier);
        options.applyServiceTierPricing(output.usage, serviceTier);
      }
      output.stopReason = mapStopReason(response?.status);
      if (output.content.some((block) => block.type === "toolCall") && output.stopReason === "stop") output.stopReason = "toolUse";
    } else if (event.type === "error") {
      throw new Error(event.message ? `Error Code ${event.code}: ${event.message}` : "Unknown error");
    } else if (event.type === "response.failed") {
      const error = event.response?.error;
      const details = event.response?.incomplete_details;
      const message = error
        ? `${error.code || "unknown"}: ${error.message || "no message"}`
        : details?.reason
          ? `incomplete: ${details.reason}`
          : "Unknown error (no error details in response)";
      throw new Error(message);
    }
  }
}
