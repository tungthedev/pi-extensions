export type InteractiveLaunchMode = "spawn" | "fork" | "resume";

export function buildInteractivePiArgs(options: {
  sessionFile: string;
  sessionDir: string;
  extensionEntry: string;
  launchMode: InteractiveLaunchMode;
  model?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  developerInstructions?: string;
  taskPath?: string;
}): string[] {
  const args = [
    "--session",
    options.sessionFile,
    "--session-dir",
    options.sessionDir,
    "--no-extensions",
    "-e",
    options.extensionEntry,
  ];

  if (options.launchMode !== "resume" && options.model) {
    args.push("--model", options.model);
  }
  if (options.launchMode !== "resume" && options.thinkingLevel) {
    args.push("--thinking", options.thinkingLevel);
  }

  const developerInstructions = [
    options.developerInstructions?.trim(),
    options.taskPath?.trim()
      ? `Your canonical task path is ${options.taskPath.trim()}. Other agents can address you by this path.`
      : undefined,
  ].filter(Boolean).join("\n\n");
  if (developerInstructions) {
    args.push("--append-system-prompt", developerInstructions);
  }

  return args;
}
