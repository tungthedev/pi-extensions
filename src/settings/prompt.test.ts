import assert from "node:assert/strict";
import test from "node:test";

import {
  handleLoadSkillsBeforeAgentStart,
  stripSkillListFromPrompt,
  type LoadSkillsPromptDeps,
} from "./prompt.ts";

const PROMPT_WITH_SKILLS = `Base prompt\n\nThe following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>demo</name>
    <description>Demo skill</description>
    <location>/tmp/demo/SKILL.md</location>
  </skill>
</available_skills>
Current date: 2026-04-20
Current working directory: /tmp/project`;

test("stripSkillListFromPrompt removes the Pi skill list block and keeps later metadata", () => {
  assert.equal(
    stripSkillListFromPrompt(PROMPT_WITH_SKILLS),
    `Base prompt\nCurrent date: 2026-04-20
Current working directory: /tmp/project`,
  );
});

test("handleLoadSkillsBeforeAgentStart strips the skill list when Load Skills is disabled", async () => {
  const deps: LoadSkillsPromptDeps = {
    resolveLoadSkills: async () => false,
  };

  const result = await handleLoadSkillsBeforeAgentStart(
    { systemPrompt: PROMPT_WITH_SKILLS } as never,
    {} as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: `Base prompt\nCurrent date: 2026-04-20
Current working directory: /tmp/project`,
  });
});

test("handleLoadSkillsBeforeAgentStart returns no-op when Load Skills is enabled", async () => {
  const deps: LoadSkillsPromptDeps = {
    resolveLoadSkills: async () => true,
  };

  const result = await handleLoadSkillsBeforeAgentStart(
    { systemPrompt: PROMPT_WITH_SKILLS } as never,
    {} as never,
    deps,
  );

  assert.equal(result, undefined);
});

test("handleLoadSkillsBeforeAgentStart honors the session-scoped load-skills override", async () => {
  const deps: LoadSkillsPromptDeps = {
    resolveLoadSkills: async () => false,
  };

  const result = await handleLoadSkillsBeforeAgentStart(
    { systemPrompt: PROMPT_WITH_SKILLS } as never,
    { sessionManager: { getBranch: () => [] } } as never,
    deps,
  );

  assert.deepEqual(result, {
    systemPrompt: `Base prompt\nCurrent date: 2026-04-20
Current working directory: /tmp/project`,
  });
});

test("handleLoadSkillsBeforeAgentStart trusts structured skill metadata when Pi reports no loaded skills", async () => {
  const deps: LoadSkillsPromptDeps = {
    resolveLoadSkills: async () => false,
  };

  const result = await handleLoadSkillsBeforeAgentStart(
    {
      systemPrompt: PROMPT_WITH_SKILLS,
      systemPromptOptions: {
        cwd: "/tmp/project",
        skills: [],
      },
    } as never,
    {} as never,
    deps,
  );

  assert.equal(result, undefined);
});
