import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import codexContent from "../codex-content/index.ts";
import codexSystemPrompt from "../codex-system-prompt/index.ts";
import codexSubagents from "./index.ts";

export default function codexChildEntry(pi: ExtensionAPI) {
  codexSystemPrompt(pi);
  codexContent(pi);
  codexSubagents(pi);
}
