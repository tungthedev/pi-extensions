import { expect, test } from "bun:test";

import { registerShellExtension as rootRegisterShellExtension } from "./index.js";
import { registerCodexContentExtension } from "./codex-content/index.js";
import { registerDroidContentExtension } from "./droid-content/index.js";
import { registerShellExtension } from "./shell/index.js";
import { registerSubagentsExtension } from "./subagents/index.js";
import { registerSystemMdExtension } from "./system-md/index.js";

import { registerCodexCompatibilityTools } from "./codex-content/primitives.js";
import { registerDroidEasyTools } from "./droid-content/primitives.js";
import { createShellToolDefinition, registerShellTool } from "./shell/primitives.js";
import { registerSubagentsCommand } from "./subagents/primitives.js";

test("stable bundle modules expose named register functions", () => {
  expect(typeof rootRegisterShellExtension).toBe("function");
  expect(typeof registerCodexContentExtension).toBe("function");
  expect(typeof registerDroidContentExtension).toBe("function");
  expect(typeof registerShellExtension).toBe("function");
  expect(typeof registerSubagentsExtension).toBe("function");
  expect(typeof registerSystemMdExtension).toBe("function");
});

test("primitive modules expose stable composition helpers", () => {
  expect(typeof registerCodexCompatibilityTools).toBe("function");
  expect(typeof registerDroidEasyTools).toBe("function");
  expect(typeof createShellToolDefinition).toBe("function");
  expect(typeof registerShellTool).toBe("function");
  expect(typeof registerSubagentsCommand).toBe("function");
});
