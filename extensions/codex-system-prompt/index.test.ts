import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAgentProfilePromptBlock,
  buildCodexPrompt,
  buildDefaultCollaborationModeInstructions,
  buildDefaultCollaborationModePrompt,
  injectCodexPrompt,
  parseCodexPersonality,
  readCodexPersonality,
  readAgentProfilePromptPayload,
  resolveCodexConfigPath,
  resolveCodexHome,
  resolveCodexPromptBody,
} from "./index.ts";

test("resolveCodexHome uses CODEX_HOME when it points to a directory", async () => {
  const tempDir = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-home-")),
  );

  assert.equal(resolveCodexHome({ CODEX_HOME: tempDir }, "/Users/test"), fs.realpathSync(tempDir));
});

test("resolveCodexConfigPath defaults to ~/.codex/config.toml", () => {
  assert.equal(resolveCodexConfigPath({}, "/Users/test"), "/Users/test/.codex/config.toml");
});

test("parseCodexPersonality reads top-level personality", () => {
  assert.equal(parseCodexPersonality('model = "gpt-5.4"\npersonality = "friendly"\n'), "friendly");
  assert.equal(parseCodexPersonality('personality = "pragmatic" # comment\n'), "pragmatic");
  assert.equal(parseCodexPersonality('personality = "unknown"\n'), undefined);
});

test("readCodexPersonality reads personality from CODEX_HOME config.toml", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-config-"));
  await fs.writeFile(path.join(tempDir, "config.toml"), 'personality = "friendly"\n');

  assert.equal(readCodexPersonality({ CODEX_HOME: tempDir }, "/Users/test"), "friendly");
});

test("buildCodexPrompt trims and returns the packaged prompt body", () => {
  const prompt = buildCodexPrompt("Base Codex prompt");

  assert.equal(prompt, "Base Codex prompt");
});

test("resolveCodexPromptBody uses exact model match and template default personality", () => {
  const prompt = resolveCodexPromptBody("gpt-5.4", {
    models: [
      {
        slug: "gpt-5.4",
        base_instructions: "fallback base",
        model_messages: {
          instructions_template: "Header\n\n{{ personality }}\n\nBody",
          instructions_variables: {
            personality_default: "Default personality",
          },
        },
      },
    ],
  });

  assert.equal(prompt, "Header\n\nDefault personality\n\nBody");
});

test("resolveCodexPromptBody uses configured personality variant when present", () => {
  const prompt = resolveCodexPromptBody(
    "gpt-5.4",
    {
      models: [
        {
          slug: "gpt-5.4",
          base_instructions: "fallback base",
          model_messages: {
            instructions_template: "Header\n\n{{ personality }}\n\nBody",
            instructions_variables: {
              personality_default: "Default personality",
              personality_friendly: "Friendly personality",
              personality_pragmatic: "Pragmatic personality",
            },
          },
        },
      ],
    },
    "friendly",
  );

  assert.equal(prompt, "Header\n\nFriendly personality\n\nBody");
});

test("resolveCodexPromptBody falls back unknown gpt models to gpt-5.4", () => {
  const prompt = resolveCodexPromptBody("gpt-6-experimental", {
    models: [
      {
        slug: "gpt-5.4",
        base_instructions: "gpt-5.4 prompt",
      },
    ],
  });

  assert.equal(prompt, "gpt-5.4 prompt");
});

test("resolveCodexPromptBody skips codex prompt for non-gpt unknown models", () => {
  const prompt = resolveCodexPromptBody("claude-sonnet", {
    models: [
      {
        slug: "gpt-5.4",
        base_instructions: "gpt-5.4 prompt",
      },
    ],
  });

  assert.equal(prompt, "");
});

test("injectCodexPrompt appends once and is idempotent", () => {
  const codexPrompt = buildCodexPrompt("Base Codex prompt");
  const once = injectCodexPrompt("Existing system prompt", codexPrompt);
  const twice = injectCodexPrompt(once, codexPrompt);

  assert.match(once, /^Existing system prompt\n\nBase Codex prompt/m);
  assert.equal(twice, once);
});

test("injectCodexPrompt handles empty existing prompt", () => {
  const codexPrompt = buildCodexPrompt("Base Codex prompt");

  assert.equal(injectCodexPrompt(undefined, codexPrompt), codexPrompt);
  assert.equal(injectCodexPrompt("", codexPrompt), codexPrompt);
});

test("buildDefaultCollaborationModeInstructions populates Codex Default mode template variables", () => {
  const prompt = buildDefaultCollaborationModeInstructions();

  assert.match(prompt, /^# Collaboration Mode: Default/m);
  assert.match(prompt, /Known mode names are Default\./);
  assert.match(prompt, /The `request_user_input` tool is available in Default mode\./);
  assert.match(prompt, /prefer using the `request_user_input` tool/);
  assert.doesNotMatch(prompt, /\{\{KNOWN_MODE_NAMES\}\}/);
  assert.doesNotMatch(prompt, /\{\{REQUEST_USER_INPUT_AVAILABILITY\}\}/);
  assert.doesNotMatch(prompt, /\{\{ASKING_QUESTIONS_GUIDANCE\}\}/);
});

test("buildDefaultCollaborationModePrompt wraps Default mode instructions in collaboration tags", () => {
  const prompt = buildDefaultCollaborationModePrompt();

  assert.match(prompt, /^<collaboration_mode># Collaboration Mode: Default/m);
  assert.match(prompt, /<\/collaboration_mode>$/);
});

test("readAgentProfilePromptPayload returns parsed profile bootstrap data", () => {
  const payload = readAgentProfilePromptPayload({
    PI_CODEX_AGENT_PROFILE_JSON: JSON.stringify({
      name: "explorer",
      developerInstructions: "You are an explorer.",
    }),
  });

  assert.deepEqual(payload, {
    name: "explorer",
    developerInstructions: "You are an explorer.",
  });
});

test("buildAgentProfilePromptBlock returns developer instructions only when present", () => {
  assert.equal(
    buildAgentProfilePromptBlock({
      name: "explorer",
      developerInstructions: "You are an explorer.",
    }),
    "You are an explorer.",
  );
  assert.equal(buildAgentProfilePromptBlock({ name: "explorer" }), "");
  assert.equal(buildAgentProfilePromptBlock(undefined), "");
});
