export interface ExtensionHostCapabilities {
  ui?: boolean;
  shortcuts?: boolean;
  terminalInput?: boolean;
  customUi?: boolean;
  editorReplacement?: boolean;
  themes?: boolean;
  headless?: boolean;
}

export interface ConfigStorageOptions {
  configDir?: string;
  configPath?: string;
}

export type ExtensionToolCapability =
  | "filesystem.read"
  | "filesystem.write"
  | "subprocess"
  | "network"
  | "subagents"
  | "session"
  | "interaction"
  | "workflow";

export interface ExtensionToolMetadata {
  name: string;
  source: string;
  capability: ExtensionToolCapability;
  mutates?: boolean;
  requiresApproval?: boolean;
}
