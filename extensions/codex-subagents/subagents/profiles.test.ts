import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applySpawnAgentProfile,
  buildSpawnAgentTypeDescription,
  clearResolvedAgentProfilesCache,
  loadCustomAgentProfiles,
  parseCodexRoleDeclarations,
  parseCodexRoleFile,
  parseBundledRoleAsset,
  resolveAgentProfiles,
  resolveBuiltInAgentProfiles,
  resolveCodexConfigPath,
  resolveRequestedAgentType,
} from "./profiles.ts";

test("resolveBuiltInAgentProfiles returns built-in profiles", () => {
  const resolved = resolveBuiltInAgentProfiles();

  assert.equal(resolved.defaultRoleName, "default");
  assert.deepEqual([...resolved.profiles.keys()], ["default", "explorer", "worker"]);
  assert.deepEqual(resolved.warnings, []);
});

test("resolveBuiltInAgentProfiles includeHidden stays stable without hidden built-ins", () => {
  const resolved = resolveBuiltInAgentProfiles({ includeHidden: true });

  assert.deepEqual([...resolved.profiles.keys()], ["default", "explorer", "worker"]);
  assert.equal(resolved.profiles.get("explorer")?.developerInstructions, undefined);
  assert.equal(resolved.profiles.get("worker")?.developerInstructions, undefined);
});

test("parseBundledRoleAsset extracts developer instructions and role settings", () => {
  const parsed = parseBundledRoleAsset(
    'model = "gpt-5"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = """Be careful\nand focused\n"""\nnickname_candidates = ["Ada", "Lin"]\n',
  );

  assert.deepEqual(parsed, {
    developerInstructions: "Be careful\nand focused",
    nicknameCandidates: ["Ada", "Lin"],
    model: "gpt-5",
    reasoningEffort: "high",
  });
});

test("buildSpawnAgentTypeDescription lists visible built-in profiles", () => {
  const description = buildSpawnAgentTypeDescription(resolveAgentProfiles());

  assert.match(description, /^Optional type name for the new agent\./);
  assert.match(description, /If omitted, `default` is used\./);
  assert.match(description, /default: \{\nDefault agent\.\n\}/);
  assert.match(description, /explorer: \{/);
  assert.match(description, /worker: \{/);
  assert.doesNotMatch(description, /reviewer:/);
});

test("resolveRequestedAgentType defaults omitted values to default", () => {
  assert.equal(resolveRequestedAgentType(undefined), "default");
  assert.equal(resolveRequestedAgentType(""), "default");
  assert.equal(resolveRequestedAgentType("  "), "default");
  assert.equal(resolveRequestedAgentType("explorer"), "explorer");
});

test("applySpawnAgentProfile defaults to default profile and preserves explicit overrides when unlocked", () => {
  const applied = applySpawnAgentProfile({
    profiles: resolveBuiltInAgentProfiles({ includeHidden: true }).profiles,
    requestedModel: "gpt-5-mini",
    requestedReasoningEffort: "medium",
  });

  assert.equal(applied.agentType, "default");
  assert.equal(applied.effectiveModel, "gpt-5-mini");
  assert.equal(applied.effectiveReasoningEffort, "medium");
  assert.equal(applied.bootstrap.name, "default");
});

test("applySpawnAgentProfile enforces locked role reasoning settings", () => {
  const applied = applySpawnAgentProfile({
    requestedAgentType: "reviewer",
    profiles: new Map([
      [
        "reviewer",
        {
          name: "reviewer",
          available: true,
          lockedModel: false,
          lockedReasoningEffort: true,
          reasoningEffort: "low",
          source: "codex-config",
          visible: true,
        },
      ],
    ]),
    requestedReasoningEffort: "high",
  });

  assert.equal(applied.agentType, "reviewer");
  assert.equal(applied.effectiveReasoningEffort, "low");
  assert.equal(applied.profile.lockedReasoningEffort, true);
});

test("applySpawnAgentProfile rejects unknown roles", () => {
  assert.throws(
    () =>
      applySpawnAgentProfile({
        requestedAgentType: "missing",
        profiles: resolveBuiltInAgentProfiles().profiles,
      }),
    /unknown agent_type 'missing'/,
  );
});

test("applySpawnAgentProfile returns unavailable error for unavailable custom role", () => {
  assert.throws(
    () =>
      applySpawnAgentProfile({
        requestedAgentType: "broken",
        profiles: new Map([
          [
            "broken",
            {
              name: "broken",
              available: false,
              unavailableReason: "agent type is currently not available",
              lockedModel: false,
              lockedReasoningEffort: false,
              source: "codex-config",
              visible: false,
            },
          ],
        ]),
      }),
    /agent type is currently not available/,
  );
});

test("resolveCodexConfigPath prefers explicit env path, then CODEX_HOME, then ~/.codex", () => {
  assert.equal(
    resolveCodexConfigPath({ PI_CODEX_CONFIG_PATH: "/tmp/custom.toml" } as NodeJS.ProcessEnv),
    path.resolve("/tmp/custom.toml"),
  );
  assert.equal(
    resolveCodexConfigPath({ CODEX_HOME: "/tmp/codex-home" } as NodeJS.ProcessEnv),
    path.resolve("/tmp/codex-home", "config.toml"),
  );
  assert.equal(
    resolveCodexConfigPath({ HOME: "/tmp/home" } as NodeJS.ProcessEnv),
    path.join("/tmp/home", ".codex", "config.toml"),
  );
});

test("parseCodexRoleDeclarations reads [agents.*] table entries", () => {
  const declarations = parseCodexRoleDeclarations(`
[agents.researcher]
description = "Research carefully"
config_file = "roles/researcher.toml"
nickname_candidates = ["Ada", "Lin"]

[agents.reviewer]
description = "Review changes"
`);

  assert.deepEqual(declarations, [
    {
      declaredName: "researcher",
      description: "Research carefully",
      configFile: "roles/researcher.toml",
      nicknameCandidates: ["Ada", "Lin"],
    },
    {
      declaredName: "reviewer",
      description: "Review changes",
      configFile: undefined,
      nicknameCandidates: undefined,
    },
  ]);
});

test("parseCodexRoleDeclarations stops at the next non-agents section", () => {
  const declarations = parseCodexRoleDeclarations(`
[agents.researcher]
description = "Research carefully"

[mcp_servers.demo]
command = "demo"
`);

  assert.deepEqual(declarations, [
    {
      declaredName: "researcher",
      description: "Research carefully",
      configFile: undefined,
      nicknameCandidates: undefined,
    },
  ]);
});

test("parseCodexRoleFile reads role metadata and settings", () => {
  const parsed = parseCodexRoleFile(`
name = "archivist"
description = "Archive carefully"
nickname_candidates = ["Hypatia"]
model = "gpt-5"
model_reasoning_effort = "high"
developer_instructions = """Stay organized\nand focused\n"""
`);

  assert.deepEqual(parsed, {
    name: "archivist",
    description: "Archive carefully",
    nicknameCandidates: ["Hypatia"],
    developerInstructions: "Stay organized\nand focused",
    model: "gpt-5",
    reasoningEffort: "high",
  });
});

test("loadCustomAgentProfiles loads config-declared and discovered roles", () => {
  const root = mkdtempSync(path.join(tmpdir(), "codex-agent-profiles-"));
  const codexHome = path.join(root, ".codex");
  const agentsDir = path.join(codexHome, "agents");
  mkdirSync(agentsDir, { recursive: true });

  const configPath = path.join(codexHome, "config.toml");
  const declaredRolePath = path.join(codexHome, "researcher.toml");
  const discoveredRolePath = path.join(agentsDir, "reviewer.toml");

  writeFileSync(
    configPath,
    [
      "[agents.researcher]",
      'description = "Research carefully"',
      'config_file = "researcher.toml"',
      'nickname_candidates = ["Ada"]',
      "",
    ].join("\n"),
  );
  writeFileSync(
    declaredRolePath,
    [
      'name = "archivist"',
      'developer_instructions = """Archive findings carefully."""',
      'model = "gpt-5"',
      'model_reasoning_effort = "high"',
      "",
    ].join("\n"),
  );
  writeFileSync(
    discoveredRolePath,
    [
      'description = "Review changes"',
      'developer_instructions = """Review carefully."""',
      "",
    ].join("\n"),
  );

  const loaded = loadCustomAgentProfiles({ PI_CODEX_CONFIG_PATH: configPath } as NodeJS.ProcessEnv);

  assert.deepEqual([...loaded.profiles.keys()], ["archivist", "reviewer"]);
  assert.equal(loaded.profiles.get("archivist")?.description, "Research carefully");
  assert.equal(loaded.profiles.get("archivist")?.model, "gpt-5");
  assert.equal(loaded.profiles.get("archivist")?.reasoningEffort, "high");
  assert.equal(loaded.profiles.get("reviewer")?.description, "Review changes");
  assert.deepEqual(loaded.warnings, []);

  rmSync(root, { recursive: true, force: true });
});

test("loadCustomAgentProfiles reports malformed custom role files as warnings", () => {
  const root = mkdtempSync(path.join(tmpdir(), "codex-agent-profiles-warn-"));
  const codexHome = path.join(root, ".codex");
  mkdirSync(codexHome, { recursive: true });

  const configPath = path.join(codexHome, "config.toml");
  writeFileSync(
    configPath,
    [
      "[agents.broken]",
      'config_file = "missing.toml"',
      "",
    ].join("\n"),
  );

  const loaded = loadCustomAgentProfiles({ PI_CODEX_CONFIG_PATH: configPath } as NodeJS.ProcessEnv);

  assert.equal(loaded.profiles.size, 1);
  assert.equal(loaded.profiles.get("broken")?.available, false);
  assert.equal(loaded.warnings.length, 1);
  assert.match(loaded.warnings[0] ?? "", /failed to load codex role file/);

  rmSync(root, { recursive: true, force: true });
});

test("resolveAgentProfiles merges custom roles before built-ins", () => {
  const root = mkdtempSync(path.join(tmpdir(), "codex-agent-profiles-merged-"));
  const codexHome = path.join(root, ".codex");
  mkdirSync(codexHome, { recursive: true });

  const configPath = path.join(codexHome, "config.toml");
  writeFileSync(
    configPath,
    [
      "[agents.researcher]",
      'description = "Research carefully"',
      "",
    ].join("\n"),
  );

  const previousConfigPath = process.env.PI_CODEX_CONFIG_PATH;
  process.env.PI_CODEX_CONFIG_PATH = configPath;
  clearResolvedAgentProfilesCache();

  const resolved = resolveAgentProfiles();
  const description = buildSpawnAgentTypeDescription(resolved);

  assert.deepEqual([...resolved.profiles.keys()], ["researcher", "default", "explorer", "worker"]);
  assert.ok(description.indexOf("researcher: {") < description.indexOf("default: {"));

  clearResolvedAgentProfilesCache();
  if (previousConfigPath === undefined) {
    delete process.env.PI_CODEX_CONFIG_PATH;
  } else {
    process.env.PI_CODEX_CONFIG_PATH = previousConfigPath;
  }
  rmSync(root, { recursive: true, force: true });
});

test("broken custom role shadows built-in role as unavailable", () => {
  const root = mkdtempSync(path.join(tmpdir(), "codex-agent-profiles-shadow-"));
  const codexHome = path.join(root, ".codex");
  mkdirSync(codexHome, { recursive: true });

  const configPath = path.join(codexHome, "config.toml");
  writeFileSync(
    configPath,
    [
      "[agents.explorer]",
      'config_file = "missing.toml"',
      "",
    ].join("\n"),
  );

  const previousConfigPath = process.env.PI_CODEX_CONFIG_PATH;
  process.env.PI_CODEX_CONFIG_PATH = configPath;
  clearResolvedAgentProfilesCache();

  assert.throws(
    () =>
      applySpawnAgentProfile({
        requestedAgentType: "explorer",
        profiles: resolveAgentProfiles({ includeHidden: true }).profiles,
      }),
    /agent type is currently not available/,
  );

  clearResolvedAgentProfilesCache();
  if (previousConfigPath === undefined) {
    delete process.env.PI_CODEX_CONFIG_PATH;
  } else {
    process.env.PI_CODEX_CONFIG_PATH = previousConfigPath;
  }
  rmSync(root, { recursive: true, force: true });
});
