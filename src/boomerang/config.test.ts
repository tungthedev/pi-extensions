import { expect, test } from "bun:test";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadBoomerangConfig, saveBoomerangConfig } from "./index.js";

test("boomerang config helpers honor explicit configPath", () => {
  const temp = mkdtempSync(join(tmpdir(), "boomerang-config-"));
  const configPath = join(temp, "custom.json");

  const saveError = saveBoomerangConfig(
    { toolEnabled: true, toolGuidance: "stay scoped" },
    { configPath },
  );

  expect(saveError).toBeNull();
  expect(loadBoomerangConfig({ configPath })).toEqual({
    toolEnabled: true,
    toolGuidance: "stay scoped",
  });
});
