import fs from "node:fs";

import { parseMarkdownRole } from "./roles-serializer.ts";
import type { MarkdownRole } from "./roles-types.ts";

export const BUILTIN_ROLE_NAMES = [
  "default",
  "planner",
  "researcher",
  "reviewer",
  "scout",
] as const;

export function loadBuiltinRoles(): MarkdownRole[] {
  return BUILTIN_ROLE_NAMES.map((name) => {
    const filePath = new URL(`../assets/agents/${name}.md`, import.meta.url);
    return parseMarkdownRole(fs.readFileSync(filePath, "utf8"), filePath.pathname, "builtin");
  });
}
