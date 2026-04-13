import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ReadToolInput } from "@mariozechner/pi-coding-agent";

import {
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadTool,
  createReadToolDefinition,
  createWriteTool,
  createWriteToolDefinition,
} from "@mariozechner/pi-coding-agent";

import { executePiFindWithFff } from "../shared/fff/adapters/pi-find.ts";
import { executePiGrepWithFff } from "../shared/fff/adapters/pi-grep.ts";
import { resolveReadToolInput } from "../shared/fff/adapters/read.ts";
import {
  buildHiddenCollapsedRenderer,
  buildSummaryRenderer,
  decorateGrepResultWithStats,
  formatEditCallDetail,
  formatListCallDetail,
  formatPatternInPathDetail,
  formatReadCallDetail,
  formatWriteCallDetail,
  summarizeFindCount,
  summarizeGrepResult,
  summarizeListCount,
} from "../shared/renderers/tool-renderers.ts";
import { applyResolvedToolset } from "../shared/toolset-resolver.ts";

const READ_DESCRIPTION =
  "Read the contents of a file. Accepts absolute paths, cwd-relative paths, @-prefixed paths, and ~ home-directory paths. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset/limit until complete.";

async function syncReadToolSet(
  pi: ExtensionAPI,
  ctx: Pick<ExtensionContext, "sessionManager">,
): Promise<void> {
  await applyResolvedToolset(pi, ctx.sessionManager);
}

export default function registerPiCustomExtension(pi: ExtensionAPI): void {
  const nativeReadDefinition = createReadToolDefinition(process.cwd());
  const nativeWrite = createWriteTool(process.cwd());
  const nativeWriteDefinition = createWriteToolDefinition(process.cwd());
  const nativeEditDefinition = createEditToolDefinition(process.cwd());
  const nativeFindDefinition = createFindToolDefinition(process.cwd());
  const nativeGrepDefinition = createGrepToolDefinition(process.cwd());
  const nativeLsDefinition = createLsToolDefinition(process.cwd());
  const readRenderer = buildHiddenCollapsedRenderer({
    title: "Read",
    getDetail: (args) =>
      formatReadCallDetail(args as { path?: string; offset?: number; limit?: number }),
    nativeRenderResult: (result, options, theme, context) =>
      nativeReadDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const writeRenderer = buildHiddenCollapsedRenderer({
    title: "Wrote",
    getDetail: (args) => formatWriteCallDetail(args as { path?: string; content?: string }),
    nativeRenderResult: (result, options, theme, context) =>
      nativeWriteDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const editRenderer = buildHiddenCollapsedRenderer({
    title: "Edited",
    getDetail: (args) => formatEditCallDetail(args as { path?: string; edits?: unknown[] }),
    nativeRenderResult: (result, options, theme, context) =>
      nativeEditDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const findRenderer = buildSummaryRenderer({
    title: "Find",
    getDetail: (args) =>
      formatPatternInPathDetail(
        args as { pattern?: string; path?: string; fallbackPattern?: string },
      ),
    summarize: summarizeFindCount,
    nativeRenderResult: (result, options, theme, context) =>
      nativeFindDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const grepRenderer = buildSummaryRenderer({
    title: "Grep",
    getDetail: (args) =>
      formatPatternInPathDetail(
        args as { pattern?: string; path?: string; fallbackPattern?: string },
      ),
    summarize: summarizeGrepResult,
    nativeRenderResult: (result, options, theme, context) =>
      nativeGrepDefinition.renderResult!(result as never, options, theme, context as never),
    expandable: false,
  });
  const listRenderer = buildSummaryRenderer({
    title: "List",
    getDetail: (args) => formatListCallDetail(args as { path?: string }),
    summarize: summarizeListCount,
    nativeRenderResult: (result, options, theme, context) =>
      nativeLsDefinition.renderResult!(result as never, options, theme, context as never),
  });

  pi.on("session_start", async (_event, ctx) => {
    await syncReadToolSet(pi, ctx);
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    await syncReadToolSet(pi, ctx);
  });

  pi.registerTool({
    ...nativeReadDefinition,
    name: "read",
    label: "read",
    description: READ_DESCRIPTION,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // `pi-custom` owns the single shared `read` tool, so this FFF-aware path resolution
      // automatically applies in Pi, Codex, and Droid modes through toolset resolution.
      const resolvedParams = await resolveReadToolInput(params as ReadToolInput, ctx);
      const nativeRead = createReadTool(ctx.cwd);
      return await nativeRead.execute(toolCallId, resolvedParams, signal, onUpdate);
    },
    renderCall(args, theme) {
      return readRenderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return readRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeWriteDefinition,
    name: "write",
    label: "write",
    async execute(toolCallId, params, signal, onUpdate) {
      return await nativeWrite.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme) {
      return writeRenderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return writeRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeEditDefinition,
    name: "edit",
    label: "edit",
    renderCall(args, theme) {
      return editRenderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return editRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeFindDefinition,
    name: "find",
    label: "find",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return await executePiFindWithFff(
        params as never,
        ctx,
        async () =>
          await nativeFindDefinition.execute!(toolCallId, params, signal, onUpdate, ctx as never),
      );
    },
    renderCall(args, theme) {
      return findRenderer.renderCall(
        { ...(args as Record<string, unknown>), fallbackPattern: "*" },
        theme,
      );
    },
    renderResult(result, options, theme, context) {
      return findRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeGrepDefinition,
    name: "grep",
    label: "grep",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executePiGrepWithFff(
        params as never,
        ctx,
        async () =>
          await nativeGrepDefinition.execute!(toolCallId, params, signal, onUpdate, ctx as never),
      );
      return decorateGrepResultWithStats(result as never);
    },
    renderCall(args, theme) {
      return grepRenderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return grepRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeLsDefinition,
    name: "ls",
    label: "ls",
    renderCall(args, theme) {
      return listRenderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return listRenderer.renderResult(result, options, theme, context);
    },
  });
}
