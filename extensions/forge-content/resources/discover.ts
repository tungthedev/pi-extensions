import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const baseDir = dirname(fileURLToPath(import.meta.url));

export function getForgeResourcePaths() {
  return {
    skillPaths: [join(baseDir, "skills")],
    promptPaths: [join(baseDir, "prompts")],
  };
}

export function registerForgeResources(pi: ExtensionAPI): void {
  pi.on("resources_discover", () => {
    return getForgeResourcePaths();
  });
}
