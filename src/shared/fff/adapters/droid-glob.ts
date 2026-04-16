import { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import { shouldUseLegacyDroidGlob } from "../query-classifier.ts";
import {
  buildScopedDiscoveryQuery,
  formatAbsolutePathList,
  getFffRuntime,
  resolveAdapterPath,
  type FffAdapterContext,
} from "./common.ts";

type DroidGlobParams = {
  patterns: string | string[];
  excludePatterns?: string | string[];
  folder?: string;
};

export async function executeDroidGlobWithFff(
  params: DroidGlobParams,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (shouldUseLegacyDroidGlob(params)) {
    return await legacyExecute();
  }

  const pattern = Array.isArray(params.patterns) ? (params.patterns[0] ?? "") : params.patterns;
  const runtime = getFffRuntime(ctx);
  const query = await buildScopedDiscoveryQuery(runtime, ctx, params.folder, pattern);
  if (!query) {
    return await legacyExecute();
  }

  const result = await runtime.findFiles({ query, limit: 100 });
  if (result.isErr()) {
    if (RuntimeInitializationError.is(result.error) || FinderOperationError.is(result.error)) {
      return await legacyExecute();
    }
    throw new Error(result.error.message);
  }

  const paths = result.value.items.map((item) => item.item.path);
  return {
    content: [
      {
        type: "text",
        text: formatAbsolutePathList(paths, {
          emptyMessage: "No files found matching pattern",
          singularLabel: "matching file",
          pluralLabel: "matching files",
          limit: 100,
        }),
      },
    ],
    details: {
      patternCount: 1,
      count: result.value.totalMatched ?? paths.length,
      path: resolveAdapterPath(ctx.cwd, params.folder),
    },
  };
}
