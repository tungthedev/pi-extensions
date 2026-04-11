import assert from "node:assert/strict";
import test from "node:test";

import { resolveSkillContent } from "./resolve.ts";

test("resolveSkillContent rejects empty skill name", async () => {
  await assert.rejects(() => resolveSkillContent(""), /skill is required/);
});

test("resolveSkillContent rejects unknown skill", async () => {
  await assert.rejects(() => resolveSkillContent("nonexistent-skill-xyz"), /not found/);
});
