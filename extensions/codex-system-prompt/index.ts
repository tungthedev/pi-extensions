import fs from "node:fs";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { CODEX_AGENT_PROFILE_JSON_ENV } from "../codex-subagents/subagents/types.ts";

const PACKAGED_PROMPT_PATH = new URL("./assets/codex-prompt.md", import.meta.url);
const DEFAULT_COLLABORATION_MODE_TEMPLATE_PATH = new URL(
  "./assets/collaboration-mode-default.md",
  import.meta.url,
);
const APPLY_PATCH_PI_OVERRIDE = [
  "## Pi harness apply_patch note",
  "",
  "In this harness, `apply_patch` is a structured tool with a single string parameter named `input`.",
  "Pass the full patch text as `input`; do not invoke `apply_patch` through `shell_command`.",
  "Raw patch text, a heredoc body, or a simple `apply_patch <<'EOF' ... EOF` wrapper are accepted inside `input`.",
].join("\n");
const COLLABORATION_MODE_OPEN_TAG = "<collaboration_mode>";
const COLLABORATION_MODE_CLOSE_TAG = "</collaboration_mode>";
const KNOWN_MODE_NAMES_PLACEHOLDER = "{{KNOWN_MODE_NAMES}}";
const REQUEST_USER_INPUT_AVAILABILITY_PLACEHOLDER = "{{REQUEST_USER_INPUT_AVAILABILITY}}";
const ASKING_QUESTIONS_GUIDANCE_PLACEHOLDER = "{{ASKING_QUESTIONS_GUIDANCE}}";

function readPromptAsset(assetPath: URL): string {
  try {
    return fs.readFileSync(assetPath, "utf-8").trim();
  } catch {
    return "";
  }
}

function readPromptBody(): string {
  return readPromptAsset(PACKAGED_PROMPT_PATH);
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

export function buildDefaultCollaborationModeInstructions(options: {
  knownModeNames?: string;
  requestUserInputAvailable?: boolean;
} = {}): string {
  const template = readPromptAsset(DEFAULT_COLLABORATION_MODE_TEMPLATE_PATH);
  if (!template) return "";

  const knownModeNames = options.knownModeNames?.trim() || "Default";
  const requestUserInputAvailable = options.requestUserInputAvailable !== false;
  const requestUserInputAvailability = requestUserInputAvailable
    ? "The `request_user_input` tool is available in Default mode."
    : "The `request_user_input` tool is unavailable in Default mode. If you call it while in Default mode, it will return an error.";
  const askingQuestionsGuidance = requestUserInputAvailable
    ? "In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, prefer using the `request_user_input` tool rather than writing a multiple choice question as a textual assistant message. Never write a multiple choice question as a textual assistant message."
    : "In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, ask the user directly with a concise plain-text question. Never write a multiple choice question as a textual assistant message.";

  return template
    .replaceAll(KNOWN_MODE_NAMES_PLACEHOLDER, knownModeNames)
    .replaceAll(REQUEST_USER_INPUT_AVAILABILITY_PLACEHOLDER, requestUserInputAvailability)
    .replaceAll(ASKING_QUESTIONS_GUIDANCE_PLACEHOLDER, askingQuestionsGuidance)
    .trim();
}

export function buildDefaultCollaborationModePrompt(options?: {
  knownModeNames?: string;
  requestUserInputAvailable?: boolean;
}): string {
  const instructions = buildDefaultCollaborationModeInstructions(options);
  if (!instructions) return "";
  return `${COLLABORATION_MODE_OPEN_TAG}${instructions}${COLLABORATION_MODE_CLOSE_TAG}`;
}

type AgentProfilePromptPayload = {
  name?: string;
  developerInstructions?: string;
};

export function readAgentProfilePromptPayload(
  env = process.env,
): AgentProfilePromptPayload | undefined {
  const raw = env[CODEX_AGENT_PROFILE_JSON_ENV]?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as AgentProfilePromptPayload;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildAgentProfilePromptBlock(payload: AgentProfilePromptPayload | undefined): string {
  const developerInstructions = payload?.developerInstructions?.trim();
  if (!developerInstructions) return "";
  return developerInstructions;
}

export function registerCodexPrompt(pi: ExtensionAPI) {
  const codexPrompt = buildCodexPrompt(readPromptBody());
  const defaultModePrompt = buildDefaultCollaborationModePrompt();
  const profilePrompt = buildAgentProfilePromptBlock(readAgentProfilePromptPayload());
  if (!codexPrompt && !defaultModePrompt && !profilePrompt) return;

  pi.on("before_agent_start", async (event) => {
    const systemPrompt = injectCodexPrompt(event.systemPrompt, codexPrompt);
    const modePrompt = injectCodexPrompt(systemPrompt, defaultModePrompt);
    return {
      systemPrompt: injectCodexPrompt(modePrompt, profilePrompt),
    };
  });
}

export default function codexSystemPrompt(pi: ExtensionAPI) {
  registerCodexPrompt(pi);
}
