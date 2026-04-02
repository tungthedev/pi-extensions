import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import codexContent from "../codex-content/index.ts";
import promptPack from "../prompt-pack/index.ts";

export default function codexChildEntry(pi: ExtensionAPI) {
  promptPack(pi);
  codexContent(pi);
}
