import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createWriteTool, createWriteToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  buildHiddenCollapsedRenderer,
  formatWriteCallDetail,
} from "../../shared/renderers/tool-renderers.ts";

const DROID_CREATE_DESCRIPTION =
  "Creates a new file on the file system with the specified content. Prefer editing existing files, unless you need to create a new file.";

const DROID_CREATE_PARAMETERS = Type.Object({
  file_path: Type.String({ description: "The path to the file for the new file." }),
  content: Type.String({ description: "The content to write to the file" }),
});

export function registerDroidCreateTool(pi: ExtensionAPI): void {
  const nativeWrite = createWriteTool(process.cwd());
  const nativeWriteDefinition = createWriteToolDefinition(process.cwd());
  const renderer = buildHiddenCollapsedRenderer({
    title: "Created",
    getDetail: (args) =>
      formatWriteCallDetail({
        path: args.file_path as string | undefined,
        content: args.content as string | undefined,
      }),
    nativeRenderResult: (result, options, theme, context) =>
      nativeWriteDefinition.renderResult!(result as never, options, theme, context as never),
    renderExpanded: (_result, options, theme, context) =>
      nativeWriteDefinition.renderCall!(
        {
          path: String(context.args?.file_path ?? "."),
          content: String(context.args?.content ?? ""),
        },
        theme,
        {
          expanded: options.expanded,
          isPartial: options.isPartial,
          argsComplete: true,
          lastComponent: undefined,
        } as never,
      ),
  });

  pi.registerTool({
    name: "Create",
    label: "Create",
    description: DROID_CREATE_DESCRIPTION,
    parameters: DROID_CREATE_PARAMETERS,
    async execute(toolCallId, params, signal, onUpdate) {
      return await nativeWrite.execute(
        toolCallId,
        {
          path: params.file_path,
          content: params.content,
        },
        signal,
        onUpdate,
      );
    },
    renderCall(args, theme) {
      return renderer.renderCall(args as Record<string, unknown>, theme);
    },
    renderResult(result, options, theme, context) {
      return renderer.renderResult(result, options, theme, context);
    },
  });
}
