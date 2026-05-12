import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerOpenAIResponsesImagePatch from "../src/openai-responses-image-patch/index.js";

export default function openaiResponsesImagePatch(pi: ExtensionAPI): void {
  registerOpenAIResponsesImagePatch(pi);
}
