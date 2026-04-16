import path from "node:path";

import type { MarkdownRole, RoleDefinition, RoleSource, RoleThinkingLevel } from "./roles-types.ts";

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatter: Record<string, string> = {};
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---")) {
    return { frontmatter, body: normalized.trim() };
  }

  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter, body: normalized.trim() };
  }

  const frontmatterBlock = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 4).trim();

  for (const line of frontmatterBlock.split("\n")) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[match[1]] = value;
  }

  return { frontmatter, body };
}

function validateThinking(value: string | undefined): RoleThinkingLevel | undefined {
  if (!value) return undefined;
  switch (value) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value;
    default:
      throw new Error(
        `invalid thinking level '${value}'. Expected one of minimal, low, medium, high, xhigh`,
      );
  }
}

function normalizeBody(body: string): string {
  return body.trim();
}

export function parseMarkdownRole(contents: string, filePath: string, source: RoleSource): MarkdownRole {
  const { frontmatter, body } = parseFrontmatter(contents);
  const fileName = path.basename(filePath, path.extname(filePath));
  const name = frontmatter.name?.trim();
  if (!name) {
    throw new Error(`role file '${filePath}' is missing required frontmatter field 'name'`);
  }
  if (name !== fileName) {
    throw new Error(`frontmatter name '${name}' does not match filename '${fileName}'`);
  }

  return {
    name,
    description: frontmatter.description?.trim() ?? "",
    model: frontmatter.model?.trim() || undefined,
    thinking: validateThinking(frontmatter.thinking?.trim()),
    prompt: normalizeBody(body),
    filePath,
    source,
  };
}

export function serializeMarkdownRole(role: RoleDefinition): string {
  const lines = ["---", `name: ${role.name}`, `description: ${role.description}`];
  if (role.model) lines.push(`model: ${role.model}`);
  if (role.thinking) lines.push(`thinking: ${role.thinking}`);
  lines.push("---", "");
  return `${lines.join("\n")}\n${normalizeBody(role.prompt)}\n`;
}
