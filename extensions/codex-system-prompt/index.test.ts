import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCodexPrompt,
  injectCodexPrompt,
  parseCodexPersonality,
  readCodexPersonality,
  readFallbackModelsCatalog,
  readModelsCatalog,
  resolveCodexHome,
  resolveCodexModelsCachePath,
  resolveCodexPromptBody,
  resolveConfiguredModelCatalogPath,
} from "./index.ts";

test("resolveCodexHome uses CODEX_HOME when it points to a directory", async () => {
  const tempDir = await import("node:fs/promises").then((fs) =>
    fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-home-")),
  );

  assert.equal(resolveCodexHome({ CODEX_HOME: tempDir }, "/Users/test"), fs.realpathSync(tempDir));
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

test("resolveConfiguredModelCatalogPath uses PI_CODEX_MODEL_CATALOG_PATH when it points to a file", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-model-catalog-"));
  const catalogPath = path.join(tempDir, "catalog.json");
  await fs.writeFile(catalogPath, '{"models":[]}');

  assert.equal(
    resolveConfiguredModelCatalogPath({ PI_CODEX_MODEL_CATALOG_PATH: catalogPath }),
    await fs.realpath(catalogPath),
  );
});

test("resolveCodexModelsCachePath points to models_cache.json under codex home", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-model-cache-home-"));
  const codexHome = path.join(tempDir, ".codex");
  await fs.mkdir(codexHome);

  assert.equal(
    resolveCodexModelsCachePath({ CODEX_HOME: codexHome }, "/Users/test"),
    path.join(await fs.realpath(codexHome), "models_cache.json"),
  );
});

test("readFallbackModelsCatalog prefers configured catalog, then ~/.codex/models_cache.json", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-fallback-catalog-"));
  const configuredCatalogPath = path.join(tempDir, "configured.json");
  const codexHome = path.join(tempDir, ".codex");
  await fs.mkdir(codexHome);
  await fs.writeFile(configuredCatalogPath, JSON.stringify({ models: [{ slug: "configured-model" }] }));
  await fs.writeFile(
    path.join(codexHome, "models_cache.json"),
    JSON.stringify({ models: [{ slug: "cache-model" }] }),
  );

  assert.deepEqual(
    readFallbackModelsCatalog(
      { PI_CODEX_MODEL_CATALOG_PATH: configuredCatalogPath, CODEX_HOME: codexHome },
      "/Users/test",
    ),
    {
      fetched_at: undefined,
      etag: undefined,
      client_version: undefined,
      models: [{ slug: "configured-model" }],
    },
  );

  await fs.writeFile(configuredCatalogPath, "not-json");

  assert.deepEqual(
    readFallbackModelsCatalog(
      { PI_CODEX_MODEL_CATALOG_PATH: configuredCatalogPath, CODEX_HOME: codexHome },
      "/Users/test",
    ),
    {
      fetched_at: undefined,
      etag: undefined,
      client_version: undefined,
      models: [{ slug: "cache-model" }],
    },
  );
});

test("readModelsCatalog parses codex models_cache.json metadata and models array", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-models-cache-format-"));
  const catalogPath = path.join(tempDir, "models_cache.json");
  await fs.writeFile(
    catalogPath,
    JSON.stringify({
      fetched_at: "2026-03-25T01:12:09.045949Z",
      etag: 'W/"abc"',
      client_version: "0.0.0",
      models: [
        { slug: "gpt-5.4", base_instructions: "prompt" },
        null,
      ],
    }),
  );

  assert.deepEqual(readModelsCatalog(catalogPath), {
    fetched_at: "2026-03-25T01:12:09.045949Z",
    etag: 'W/"abc"',
    client_version: "0.0.0",
    models: [{ slug: "gpt-5.4", base_instructions: "prompt" }],
  });
});

test("readModelsCatalog rejects json without a models array", async () => {
  const fs = await import("node:fs/promises");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-codex-models-cache-invalid-"));
  const catalogPath = path.join(tempDir, "models_cache.json");
  await fs.writeFile(catalogPath, JSON.stringify({ fetched_at: "2026-03-25T01:12:09.045949Z" }));

  assert.equal(readModelsCatalog(catalogPath), undefined);
});

test("resolveCodexPromptBody uses exact model match from primary catalog", () => {
  const prompt = resolveCodexPromptBody(
    "gpt-5.4",
    [
      {
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
      },
    ],
  );

  assert.equal(prompt, "Header\n\nDefault personality\n\nBody");
});

test("resolveCodexPromptBody uses configured personality variant when present", () => {
  const prompt = resolveCodexPromptBody(
    "gpt-5.4",
    [
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
    ],
    "friendly",
  );

  assert.equal(prompt, "Header\n\nFriendly personality\n\nBody");
});

test("resolveCodexPromptBody uses secondary fallback catalog when bundled catalog misses model", () => {
  const prompt = resolveCodexPromptBody("claude-sonnet", [
    { models: [{ slug: "gpt-5.4", base_instructions: "bundled gpt-5.4 prompt" }] },
    { models: [{ slug: "claude-sonnet", base_instructions: "secondary exact prompt" }] },
  ]);

  assert.equal(prompt, "secondary exact prompt");
});

test("resolveCodexPromptBody falls back to gpt-5.4 for unknown models of any family", () => {
  const prompt = resolveCodexPromptBody("claude-sonnet", [
    { models: [{ slug: "gpt-5.4", base_instructions: "gpt-5.4 prompt" }] },
  ]);

  assert.equal(prompt, "gpt-5.4 prompt");
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
