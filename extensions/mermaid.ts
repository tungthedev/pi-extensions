/**
 * Mermaid rendering and viewer extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerMermaidExtension from "../src/mermaid/index.ts";

export default function mermaid(pi: ExtensionAPI): void {
  registerMermaidExtension(pi);
}
