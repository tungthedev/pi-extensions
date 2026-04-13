import { decorateGrepResultWithStats } from "../../renderers/tool-renderers.ts";
import { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import {
  inferFffGrepMode,
  isExplicitGlobPattern,
  looksLikeRegexPattern,
  shouldUseLegacyDroidGrep,
} from "../query-classifier.ts";
import {
  formatAbsolutePathList,
  getFffRuntime,
  resolveAdapterPath,
  type FffAdapterContext,
} from "./common.ts";

type DroidGrepParams = {
  pattern: string;
  path?: string;
  glob_pattern?: string;
  output_mode?: "file_paths" | "content";
  case_insensitive?: boolean;
  type?: string;
  context_before?: number;
  context_after?: number;
  context?: number;
  line_numbers?: boolean;
  head_limit?: number;
  multiline?: boolean;
  fixed_string?: boolean;
};

export async function executeDroidGrepWithFff(
  params: DroidGrepParams,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (
    shouldUseLegacyDroidGrep(params) ||
    looksLikeRegexPattern(params.pattern) ||
    (params.glob_pattern ? isExplicitGlobPattern(params.glob_pattern) : false)
  ) {
    return await legacyExecute();
  }

  const outputMode = params.output_mode ?? "file_paths";
  const runtime = getFffRuntime(ctx);
  const result = await runtime.grepSearch({
    pattern: params.pattern,
    mode: inferFffGrepMode({ pattern: params.pattern, literal: params.fixed_string }),
    pathQuery: params.path,
    glob: params.glob_pattern,
    limit: Math.max(25, params.head_limit ?? 100),
    outputMode: outputMode === "content" ? "content" : "files_with_matches",
  });
  if (result.isErr()) {
    if (RuntimeInitializationError.is(result.error) || FinderOperationError.is(result.error)) {
      return await legacyExecute();
    }
    throw new Error(result.error.message);
  }

  if (outputMode === "content") {
    return decorateGrepResultWithStats({
      content: [{ type: "text", text: result.value.formatted }],
      details: {
        path: resolveAdapterPath(ctx.cwd, params.path),
        pattern: params.pattern,
        outputMode,
      },
    });
  }

  const paths = Array.from(new Set(result.value.items.map((item) => item.path)));
  return {
    content: [
      {
        type: "text",
        text: formatAbsolutePathList(paths, {
          emptyMessage: "No matches found",
          singularLabel: "matching file",
          pluralLabel: "matching files",
          limit: Math.max(1, params.head_limit ?? 100),
          hasMore: Boolean(result.value.nextCursor),
        }),
      },
    ],
    details: {
      path: resolveAdapterPath(ctx.cwd, params.path),
      pattern: params.pattern,
      outputMode,
      count: paths.length,
    },
  };
}
