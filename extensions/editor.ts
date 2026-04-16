/**
 * Editor UI extension.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerEditorExtension from "../src/editor/index.ts";

export default function editor(pi: ExtensionAPI): void {
  registerEditorExtension(pi);
}
