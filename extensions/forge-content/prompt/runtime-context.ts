type ActiveToolInfo = {
  name: string;
  description: string;
};

export type ForgeRuntimeContextOptions = {
  cwd: string;
  activeTools: ActiveToolInfo[];
  shell?: string;
  homeDir?: string;
  currentDate?: string;
};

function formatActiveTools(activeTools: ActiveToolInfo[]): string {
  if (activeTools.length === 0) {
    return "- none";
  }

  return activeTools
    .map((tool) => {
      const description = tool.description.trim().replace(/\s+/g, " ");
      return `- ${tool.name}: ${description}`;
    })
    .join("\n");
}

export function buildForgeRuntimeContext(options: ForgeRuntimeContextOptions): string {
  const date = options.currentDate ?? new Date().toISOString().slice(0, 10);

  return [
    "<forge_runtime>",
    `  <current_date>${date}</current_date>`,
    `  <current_working_directory>${options.cwd}</current_working_directory>`,
    options.shell ? `  <default_shell>${options.shell}</default_shell>` : undefined,
    options.homeDir ? `  <home_directory>${options.homeDir}</home_directory>` : undefined,
    "</forge_runtime>",
    "",
    "<forge_active_tools>",
    formatActiveTools(options.activeTools),
    "</forge_active_tools>",
    "",
    "Use available skills and project guidelines when they apply to the task.",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
