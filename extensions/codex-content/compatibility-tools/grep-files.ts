import fs from "node:fs/promises";
import path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { execCommand, resolveAbsolutePath, trimToBudget } from "./runtime.ts";

export function registerGrepFilesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "grep_files",
    label: "grep_files",
    description:
      "Finds files whose contents match the pattern and lists them by modification time.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Regular expression pattern to search for." }),
      include: Type.Optional(
        Type.String({ description: "Optional glob that limits which files are searched." }),
      ),
      path: Type.Optional(Type.String({ description: "Directory or file path to search." })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of file paths to return." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const searchPath = resolveAbsolutePath(ctx.cwd, params.path ?? ".");
      const args = ["--files-with-matches", "--no-messages"];
      if (params.include) {
        args.push("--glob", params.include);
      }
      args.push(params.pattern, searchPath);

      const result = await execCommand("rg", args, ctx.cwd, { signal });
      if (result.exitCode === 1 || (!result.stdout.trim() && !result.stderr.trim())) {
        return {
          content: [{ type: "text", text: "No matches found" }],
          details: { pattern: params.pattern, count: 0 },
        };
      }
      if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || `rg exited with code ${result.exitCode}`);
      }

      const files = result.stdout
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (path.isAbsolute(line) ? line : path.resolve(ctx.cwd, line)));

      const withStats = await Promise.all(
        files.map(async (file) => ({
          file,
          stat: await fs.stat(file).catch(() => null),
        })),
      );

      withStats.sort((left, right) => {
        const leftTime = left.stat?.mtimeMs ?? 0;
        const rightTime = right.stat?.mtimeMs ?? 0;
        if (rightTime !== leftTime) return rightTime - leftTime;
        return left.file.localeCompare(right.file);
      });

      const limit = params.limit ?? 100;
      const visible = withStats.slice(0, limit).map((entry) => entry.file);
      let output = visible.join("\n");
      if (withStats.length > visible.length) {
        output += `\n\n[Output truncated: ${visible.length} of ${withStats.length} matches shown]`;
      }
      const trimmed = trimToBudget(output);

      return {
        content: [{ type: "text", text: trimmed.text || "No matches found" }],
        details: { pattern: params.pattern, count: withStats.length },
      };
    },
    renderCall() {
      return undefined;
    },
    renderResult() {
      return undefined;
    },
  });
}
