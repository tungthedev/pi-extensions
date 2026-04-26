import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerOpenAIResponsesImagePatch from "../src/openai-responses-image-patch/index.ts";

export default function openaiResponsesImagePatch(pi: ExtensionAPI): void {
  registerOpenAIResponsesImagePatch(pi);
}
