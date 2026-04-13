import { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import { inferFffGrepMode, looksLikeRegexPattern } from "../query-classifier.ts";
import {
  formatAbsolutePathList,
  getFffRuntime,
  resolveAdapterPath,
  type FffAdapterContext,
} from "./common.ts";

type GrepFilesParams = {
  pattern: string;
  include?: string;
  path?: string;
  limit?: number;
};

export async function executeCodexGrepFilesWithFff(
  params: GrepFilesParams,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (looksLikeRegexPattern(params.pattern)) {
    return await legacyExecute();
  }

  const runtime = getFffRuntime(ctx);
  const result = await runtime.grepSearch({
    pattern: params.pattern,
    mode: inferFffGrepMode({ pattern: params.pattern }),
    pathQuery: params.path,
    glob: params.include,
    limit: Math.max(25, params.limit ?? 100),
    outputMode: "files_with_matches",
  });
  if (result.isErr()) {
    if (RuntimeInitializationError.is(result.error) || FinderOperationError.is(result.error)) {
      return await legacyExecute();
    }
    throw new Error(result.error.message);
  }

  const paths = Array.from(new Set(result.value.items.map((item) => item.path)));
  const limit = Math.max(1, params.limit ?? 100);

  return {
    content: [
      {
        type: "text",
        text: formatAbsolutePathList(paths, {
          emptyMessage: "0 matching files",
          singularLabel: "matching file",
          pluralLabel: "matching files",
          limit,
          hasMore: Boolean(result.value.nextCursor),
        }),
      },
    ],
    details: {
      pattern: params.pattern,
      path: resolveAdapterPath(ctx.cwd, params.path),
      count: paths.length,
      skippedCount: 0,
    },
  };
}
