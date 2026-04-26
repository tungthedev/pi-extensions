import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { GENERATED_IMAGE_CUSTOM_TYPE, registerGeneratedImageRenderer } from "./render.ts";
import { flushGeneratedImageMessages, streamSimpleOpenAIResponsesWithImages } from "./stream.ts";

const PROVIDER_NAME = "openai-responses-image-patch";

function isDisabled(): boolean {
  return process.env.PI_OPENAI_RESPONSES_IMAGE_PATCH === "0";
}

export default function registerOpenAIResponsesImagePatch(pi: ExtensionAPI): void {
  registerGeneratedImageRenderer(pi);

  if (isDisabled()) {
    return;
  }

  pi.registerProvider(PROVIDER_NAME, {
    api: "openai-responses",
    streamSimple(model, context, options) {
      return streamSimpleOpenAIResponsesWithImages(model as any, context, options, pi);
    },
  });

  let notified = false;
  pi.on("session_start", async (_event, ctx) => {
    if (notified || !ctx.hasUI) return;
    notified = true;
    ctx.ui.notify("OpenAI Responses image patch active for all openai-responses models", "info");
  });

  pi.on("agent_end", async () => {
    setTimeout(() => {
      try {
        flushGeneratedImageMessages(pi);
      } catch {
        // The assistant text still records the generated image path; avoid
        // surfacing a post-stream async exception if the UI message fails.
      }
    }, 0);
  });

  pi.on("context", async (event) => ({
    messages: event.messages.filter((message: any) => message.customType !== GENERATED_IMAGE_CUSTOM_TYPE),
  }));
}
