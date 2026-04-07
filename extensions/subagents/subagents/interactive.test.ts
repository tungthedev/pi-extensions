import assert from "node:assert/strict";
import test from "node:test";

import {
  detectShellFamily,
  exitStatusVar,
  selectPreservedInteractiveEnv,
  shellCdPrefix,
  shellDoneSentinelCommand,
  shellExternalCommand,
} from "./interactive.ts";

test("detectShellFamily recognizes nu, fish, and posix shells", () => {
  assert.equal(detectShellFamily("/opt/homebrew/bin/nu"), "nu");
  assert.equal(detectShellFamily("/usr/local/bin/fish"), "fish");
  assert.equal(detectShellFamily("/bin/zsh"), "posix");
});

test("exitStatusVar uses shell-appropriate exit status variables", () => {
  assert.equal(exitStatusVar("/opt/homebrew/bin/nu"), "$env.LAST_EXIT_CODE");
  assert.equal(exitStatusVar("/usr/local/bin/fish"), "$status");
  assert.equal(exitStatusVar("/bin/bash"), "$?");
});

test("shellCdPrefix uses ';' for nu and '&&' for other shells", () => {
  assert.equal(shellCdPrefix("/tmp/project", "/opt/homebrew/bin/nu"), "cd '/tmp/project'; ");
  assert.equal(shellCdPrefix("/tmp/project", "/bin/zsh"), "cd '/tmp/project' && ");
});

test("selectPreservedInteractiveEnv keeps only requested provider env prefixes", () => {
  assert.deepEqual(
    selectPreservedInteractiveEnv({
      _AI_GATEWAY_TOKEN: "gateway",
      GEMINI_API_KEY: "gemini",
      CLOUDFLARE_API_TOKEN: "cf",
      OPENAI_API_KEY: "openai",
      PATH: "/usr/bin",
      EMPTY: undefined,
    }),
    {
      _AI_GATEWAY_TOKEN: "gateway",
      GEMINI_API_KEY: "gemini",
      CLOUDFLARE_API_TOKEN: "cf",
    },
  );
});

test("shellDoneSentinelCommand uses shell-compatible syntax", () => {
  assert.equal(shellDoneSentinelCommand("/opt/homebrew/bin/nu"), "print $'__SUBAGENT_DONE_($env.LAST_EXIT_CODE)__'");
  assert.equal(shellDoneSentinelCommand("/usr/local/bin/fish"), "echo '__SUBAGENT_DONE_'$status'__'");
  assert.equal(shellDoneSentinelCommand("/bin/bash"), "echo '__SUBAGENT_DONE_'$?'__'");
});

test("shellExternalCommand uses Nu external-command syntax", () => {
  assert.equal(
    shellExternalCommand(
      "/Users/hoalong/.local/share/mise/installs/node/24.3.0/bin/node",
      ["/tmp/launcher.mjs", "/tmp/config.json"],
      "/opt/homebrew/bin/nu",
    ),
    "^'/Users/hoalong/.local/share/mise/installs/node/24.3.0/bin/node' '/tmp/launcher.mjs' '/tmp/config.json'",
  );
  assert.equal(
    shellExternalCommand("/usr/bin/node", ["/tmp/launcher.mjs"], "/bin/zsh"),
    "'/usr/bin/node' '/tmp/launcher.mjs'",
  );
});
