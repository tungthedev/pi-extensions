import fs from "node:fs";
import path from "node:path";

import { validateSubagentName } from "./naming.ts";
import { resolveProjectRolesTargetDir, resolveUserRolesDir } from "./roles-discovery.ts";
import { clearResolvedAgentProfilesCache } from "./profiles.ts";
import { parseMarkdownRole, serializeMarkdownRole } from "./roles-serializer.ts";
import type {
  DeleteRoleInput,
  MarkdownRole,
  RenameRoleInput,
  SaveRoleInput,
  SavedRoleResult,
} from "./roles-types.ts";

function resolveScopeDir(cwd: string, scope: "user" | "project"): string {
  if (scope === "user") return resolveUserRolesDir();
  const projectDir = resolveProjectRolesTargetDir(cwd);
  if (!projectDir) {
    throw new Error("project scope is not available here. No project root candidate was found.");
  }
  return projectDir;
}

function validateCustomRoleName(name: string, fieldName = "name"): string {
  const validated = validateSubagentName(name, fieldName);
  if (validated === "default") {
    throw new Error("'default' is a reserved builtin role name and cannot be used for custom roles");
  }
  return validated;
}

function buildRoleFilePath(cwd: string, scope: "user" | "project", name: string): string {
  return path.join(resolveScopeDir(cwd, scope), `${validateCustomRoleName(name, "name")}.md`);
}

export function saveRole(input: SaveRoleInput): SavedRoleResult {
  const name = validateCustomRoleName(input.role.name, "name");
  const filePath = buildRoleFilePath(input.cwd, input.scope, name);
  if (!input.overwrite && fs.existsSync(filePath)) {
    throw new Error(`custom role '${name}' already exists in ${input.scope} scope`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    serializeMarkdownRole({
      ...input.role,
      name,
      description: input.role.description,
      prompt: input.role.prompt,
    }),
    "utf8",
  );
  clearResolvedAgentProfilesCache();
  return {
    ...input.role,
    name,
    filePath,
    source: input.scope,
  } satisfies MarkdownRole;
}

export function renameRole(input: RenameRoleInput): SavedRoleResult {
  const fromName = validateSubagentName(input.fromName, "fromName");
  const toName = validateCustomRoleName(input.toName, "toName");
  const fromPath = buildRoleFilePath(input.cwd, input.scope, fromName);
  const toPath = buildRoleFilePath(input.cwd, input.scope, toName);
  if (!fs.existsSync(fromPath)) {
    throw new Error(`custom role '${fromName}' does not exist in ${input.scope} scope`);
  }
  if (fromPath !== toPath && fs.existsSync(toPath)) {
    throw new Error(`custom role '${toName}' already exists in ${input.scope} scope`);
  }

  const current = parseMarkdownRole(fs.readFileSync(fromPath, "utf8"), fromPath, input.scope);
  fs.writeFileSync(
    fromPath,
    serializeMarkdownRole({
      ...current,
      name: toName,
    }),
    "utf8",
  );
  fs.renameSync(fromPath, toPath);
  clearResolvedAgentProfilesCache();

  return {
    ...current,
    name: toName,
    filePath: toPath,
    source: input.scope,
  };
}

export function deleteRole(input: DeleteRoleInput): void {
  const filePath = buildRoleFilePath(input.cwd, input.scope, input.name);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
    clearResolvedAgentProfilesCache();
  }
}
