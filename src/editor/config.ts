import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";

import { mutateJsonObjectFile, readJsonObjectFile } from "../shared/json-settings.ts";

const SETTINGS_FILE = "settings.json";
const EDITOR_NAMESPACE = "editor";

type SettingsRoot = Record<string, unknown>;

export type EditorSettings = {
  fixedEditor: boolean;
  mouseScroll: boolean;
};

export type EditorSettingsUpdate = Partial<EditorSettings>;

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fixedEditor: false,
  mouseScroll: true,
};

function isRecord(value: unknown): value is SettingsRoot {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEditorSettingsUpdate(root: unknown): EditorSettingsUpdate {
  const namespace = isRecord(root) ? root[EDITOR_NAMESPACE] : undefined;
  const editor = isRecord(namespace) ? namespace : {};
  const settings: EditorSettingsUpdate = {};

  if (typeof editor.fixedEditor === "boolean") settings.fixedEditor = editor.fixedEditor;
  if (typeof editor.mouseScroll === "boolean") settings.mouseScroll = editor.mouseScroll;

  return settings;
}

export function getGlobalEditorSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, SETTINGS_FILE);
}

export function getProjectEditorSettingsPath(cwd: string): string {
  return join(cwd, ".pi", SETTINGS_FILE);
}

export function parseEditorSettings(root: unknown): EditorSettings {
  const settings = {
    ...DEFAULT_EDITOR_SETTINGS,
    ...parseEditorSettingsUpdate(root),
  };
  if (settings.fixedEditor) settings.mouseScroll = true;
  return settings;
}

export async function readEditorSettingsFromFile(filePath: string): Promise<EditorSettings> {
  return parseEditorSettings(await readJsonObjectFile(filePath));
}

export async function readEditorSettings(options: {
  cwd: string;
  globalPath?: string;
  projectPath?: string;
}): Promise<EditorSettings> {
  const globalRoot = await readJsonObjectFile(options.globalPath ?? getGlobalEditorSettingsPath());
  const projectRoot = await readJsonObjectFile(
    options.projectPath ?? getProjectEditorSettingsPath(options.cwd),
  );

  const settings = {
    ...DEFAULT_EDITOR_SETTINGS,
    ...parseEditorSettingsUpdate(globalRoot),
    ...parseEditorSettingsUpdate(projectRoot),
  };
  if (settings.fixedEditor) settings.mouseScroll = true;
  return settings;
}

export async function writeEditorSettings(
  settings: EditorSettingsUpdate,
  filePath = getGlobalEditorSettingsPath(),
): Promise<void> {
  await mutateJsonObjectFile(
    filePath,
    (root) => {
      const currentNamespace = root[EDITOR_NAMESPACE];
      const namespace = isRecord(currentNamespace) ? { ...currentNamespace } : {};
      root[EDITOR_NAMESPACE] = {
        ...namespace,
        ...settings,
      };
      return root;
    },
    { strict: true },
  );
}

export async function resolveEditorSettingsWritePath(options: {
  cwd: string;
  globalPath?: string;
  projectPath?: string;
}): Promise<string> {
  const projectPath = options.projectPath ?? getProjectEditorSettingsPath(options.cwd);
  const projectRoot = await readJsonObjectFile(projectPath);
  if (isRecord(projectRoot[EDITOR_NAMESPACE])) return projectPath;

  const globalPath = options.globalPath ?? getGlobalEditorSettingsPath();
  return globalPath;
}
