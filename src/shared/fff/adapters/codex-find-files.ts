import type { FindToolInput } from "@mariozechner/pi-coding-agent";

import { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import { shouldUseLegacyCodexFind } from "../query-classifier.ts";
import {
  buildScopedDiscoveryQuery,
  formatAbsolutePathList,
  getFffRuntime,
  resolveAdapterPath,
  type FffAdapterContext,
} from "./common.ts";

type FindFilesParams = FindToolInput & { offset?: number };
export async function executeCodexFindFilesWithFff(
  params: FindFilesParams,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (shouldUseLegacyCodexFind(params.pattern)) {
    return await legacyExecute();
  }

  const runtime = getFffRuntime(ctx);
  const query = await buildScopedDiscoveryQuery(runtime, ctx, params.path, params.pattern);
  if (!query) {
    return await legacyExecute();
  }

  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? 100);
  const result = await runtime.findFiles({
    query,
    limit: offset + limit,
  });
  if (result.isErr()) {
    if (RuntimeInitializationError.is(result.error) || FinderOperationError.is(result.error)) {
      return await legacyExecute();
    }
    throw new Error(result.error.message);
  }

  const allPaths = result.value.items.map((item) => item.item.path);
  if (allPaths.length > 0 && offset >= allPaths.length) {
    throw new Error("offset exceeds match count");
  }

  return {
    content: [
      {
        type: "text",
        text: formatAbsolutePathList(allPaths, {
          emptyMessage: "No files found matching pattern",
          singularLabel: "matching file",
          pluralLabel: "matching files",
          offset,
          limit,
        }),
      },
    ],
    details: {
      pattern: params.pattern,
      path: resolveAdapterPath(ctx.cwd, params.path),
      count: result.value.totalMatched ?? allPaths.length,
      offset,
      limit,
    },
  };
}
