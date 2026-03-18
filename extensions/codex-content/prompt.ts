import fs from "node:fs";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const PACKAGED_PROMPT_PATH = new URL("./assets/codex-prompt.md", import.meta.url);
const APPLY_PATCH_PI_OVERRIDE = [
  "## Pi harness apply_patch note",
  "",
  "In this harness, `apply_patch` is a structured tool with a single string parameter named `input`.",
  "Pass the full patch text as `input`; do not invoke `apply_patch` through `shell_command`.",
  "Raw patch text, a heredoc body, or a simple `apply_patch <<'EOF' ... EOF` wrapper are accepted inside `input`.",
].join("\n");

function readPromptBody(): string {
  try {
    return fs.readFileSync(PACKAGED_PROMPT_PATH, "utf-8").trim();
  } catch {
    return "";
  }
}

export function buildCodexPrompt(promptBody: string): string {
  return [promptBody.trim(), APPLY_PATCH_PI_OVERRIDE].filter(Boolean).join("\n\n").trim();
}

export function injectCodexPrompt(systemPrompt: string | undefined, codexPrompt: string): string {
  const basePrompt = (systemPrompt ?? "").trim();
  if (!codexPrompt) return basePrompt;
  if (basePrompt.includes(codexPrompt)) return basePrompt;
  return [basePrompt, codexPrompt].filter(Boolean).join("\n\n").trim();
}

export function registerCodexPrompt(pi: ExtensionAPI) {
  const codexPrompt = buildCodexPrompt(readPromptBody());
  if (!codexPrompt) return;

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: injectCodexPrompt(event.systemPrompt, codexPrompt),
    };
  });
}
