import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { ReadToolInput } from "@mariozechner/pi-coding-agent";
import { Box, Container, type Component } from "@mariozechner/pi-tui";

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
  buildSelfShellRenderer,
  buildSummaryRenderer,
  decorateGrepResultWithStats,
  formatEditCallDetail,
  formatListCallDetail,
  formatPatternInPathDetail,
  formatReadCallDetail,
  formatWriteCallDetail,
} from "../shared/renderers/tool-renderers.ts";
import { applyResolvedToolset } from "../shared/toolset-resolver.ts";

const READ_DESCRIPTION =
  "Read the contents of a file. Accepts absolute paths, cwd-relative paths, @-prefixed paths, and ~ home-directory paths. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset/limit until complete.";

type ReadRenderState = {
  box?: Box;
  callComponent?: Component;
  resultComponent?: Component;
  emptySlot?: Container;
};

type ToolTextPart = {
  type?: string;
  text?: string;
};

type ToolResultWithContent = {
  content?: ToolTextPart[];
};

const READ_CONTINUATION_FOOTER_PATTERN =
  /\n\n\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/;

function splitReadContinuationFooter(text: string): { body: string; footer: string } {
  const match = text.match(READ_CONTINUATION_FOOTER_PATTERN);
  if (!match || match.index === undefined) {
    return { body: text, footer: "" };
  }

  return {
    body: text.slice(0, match.index),
    footer: text.slice(match.index),
  };
}

function addLineNumbersToReadText(text: string, startLine: number): string {
  if (text.length === 0) return text;

  const { body, footer } = splitReadContinuationFooter(text);
  const lines = body.split("\n");
  const width = String(startLine + lines.length - 1).length;
  const numberedBody = lines
    .map((line, index) => `L${String(startLine + index).padStart(width)}: ${line}`)
    .join("\n");

  return `${numberedBody}${footer}`;
}

function decorateReadResultWithLineNumbers<T extends ToolResultWithContent>(
  result: T,
  startLine: number,
): T {
  if (!Array.isArray(result.content) || result.content.length === 0) {
    return result;
  }

  return {
    ...result,
    content: result.content.map((item) => {
      if (item?.type !== "text" || typeof item.text !== "string") {
        return item;
      }

      return {
        ...item,
        text: addLineNumbersToReadText(item.text, startLine),
      };
    }),
  };
}

function getReadRenderState(context: { state?: Record<string, unknown> }): ReadRenderState {
  const state = (context.state ??= {});
  const existing = state.readRenderState;
  if (existing && typeof existing === "object") {
    return existing as ReadRenderState;
  }

  const nextState: ReadRenderState = {};
  state.readRenderState = nextState;
  return nextState;
}

function getReadRenderBox(context: { state?: Record<string, unknown> }): Box {
  const state = getReadRenderState(context);
  state.box ??= new Box(1, 0);
  return state.box;
}

function syncReadRenderBox(box: Box, state: ReadRenderState): void {
  box.clear();
  if (state.callComponent) {
    box.addChild(state.callComponent);
  }
  if (state.resultComponent) {
    box.addChild(state.resultComponent);
  }
}

function isHiddenReadResult(
  component: Component,
  options: { expanded: boolean },
  context: { isError?: boolean },
): boolean {
  return !options.expanded && !context.isError && component instanceof Container;
}

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
  const findBaseRenderer = buildHiddenCollapsedRenderer({
    title: "Find",
    getDetail: (args) =>
      formatPatternInPathDetail(
        args as { pattern?: string; path?: string; fallbackPattern?: string },
      ),
    nativeRenderResult: (result, options, theme, context) =>
      nativeFindDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const findRenderer = buildSelfShellRenderer({
    stateKey: "findRenderState",
    renderCall: findBaseRenderer.renderCall,
    renderResult: findBaseRenderer.renderResult,
  });
  const grepBaseRenderer = buildHiddenCollapsedRenderer({
    title: "Grep",
    getDetail: (args) =>
      formatPatternInPathDetail(
        args as { pattern?: string; path?: string; fallbackPattern?: string },
      ),
    nativeRenderResult: (result, options, theme, context) =>
      nativeGrepDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const grepRenderer = buildSelfShellRenderer({
    stateKey: "grepRenderState",
    renderCall: grepBaseRenderer.renderCall,
    renderResult: grepBaseRenderer.renderResult,
  });
  const listBaseRenderer = buildHiddenCollapsedRenderer({
    title: "List",
    getDetail: (args) => formatListCallDetail(args as { path?: string }),
    nativeRenderResult: (result, options, theme, context) =>
      nativeLsDefinition.renderResult!(result as never, options, theme, context as never),
  });
  const listRenderer = buildSelfShellRenderer({
    stateKey: "listRenderState",
    renderCall: listBaseRenderer.renderCall,
    renderResult: listBaseRenderer.renderResult,
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
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // `pi-custom` owns the single shared `read` tool, so this FFF-aware path resolution
      // automatically applies in Pi, Codex, and Droid modes through toolset resolution.
      const resolvedParams = await resolveReadToolInput(params as ReadToolInput, ctx);
      const nativeRead = createReadTool(ctx.cwd);
      const result = await nativeRead.execute(toolCallId, resolvedParams, signal, onUpdate);
      return decorateReadResultWithLineNumbers(result, resolvedParams.offset ?? 1);
    },
    renderCall(args, theme, context) {
      const state = getReadRenderState(context as { state?: Record<string, unknown> });
      const box = getReadRenderBox(context as { state?: Record<string, unknown> });
      state.callComponent = readRenderer.renderCall(args as Record<string, unknown>, theme as Theme);
      syncReadRenderBox(box, state);
      return box;
    },
    renderResult(result, options, theme, context) {
      const state = getReadRenderState(context as { state?: Record<string, unknown> });
      const box = getReadRenderBox(context as { state?: Record<string, unknown> });
      const resultComponent = readRenderer.renderResult(result, options, theme, {
        ...context,
        lastComponent: state.resultComponent,
      });
      state.resultComponent = isHiddenReadResult(resultComponent, options, context)
        ? undefined
        : resultComponent;
      syncReadRenderBox(box, state);
      state.emptySlot ??= new Container();
      return state.emptySlot;
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
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return await executePiFindWithFff(
        params as never,
        ctx,
        async () =>
          await nativeFindDefinition.execute!(toolCallId, params, signal, onUpdate, ctx as never),
      );
    },
    renderCall(args, theme, context) {
      return findRenderer.renderCall(
        { ...(args as Record<string, unknown>), fallbackPattern: "*" },
        theme,
        context as never,
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
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = await executePiGrepWithFff(
        params as never,
        ctx,
        async () =>
          await nativeGrepDefinition.execute!(toolCallId, params, signal, onUpdate, ctx as never),
      );
      return decorateGrepResultWithStats(result as never);
    },
    renderCall(args, theme, context) {
      return grepRenderer.renderCall(args as Record<string, unknown>, theme, context as never);
    },
    renderResult(result, options, theme, context) {
      return grepRenderer.renderResult(result, options, theme, context);
    },
  });

  pi.registerTool({
    ...nativeLsDefinition,
    name: "ls",
    label: "ls",
    renderShell: "self",
    renderCall(args, theme, context) {
      return listRenderer.renderCall(args as Record<string, unknown>, theme, context as never);
    },
    renderResult(result, options, theme, context) {
      return listRenderer.renderResult(result, options, theme, context);
    },
  });
}
