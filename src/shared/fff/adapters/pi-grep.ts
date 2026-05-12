import type { GrepToolInput } from "@earendil-works/pi-coding-agent";

import { FinderOperationError, RuntimeInitializationError } from "../errors.js";
import { inferFffGrepMode, isExplicitGlobPattern } from "../query-classifier.js";
import { getFffRuntime, resolveAdapterPath, type FffAdapterContext } from "./common.js";

export async function executePiGrepWithFff(
  params: GrepToolInput,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (params.ignoreCase || (params.glob && isExplicitGlobPattern(params.glob))) {
    return await legacyExecute();
  }

  const runtime = getFffRuntime(ctx);
  const result = await runtime.grepSearch({
    pattern: params.pattern,
    mode: inferFffGrepMode({ pattern: params.pattern, literal: params.literal }),
    pathQuery: params.path,
    glob: params.glob,
    context: params.context,
    limit: params.limit,
  });
  if (result.isErr()) {
    if (RuntimeInitializationError.is(result.error) || FinderOperationError.is(result.error)) {
      return await legacyExecute();
    }
    throw new Error(result.error.message);
  }

  return {
    content: [{ type: "text", text: result.value.formatted }],
    details: {
      pattern: params.pattern,
      path: resolveAdapterPath(ctx.cwd, params.path),
      nextCursor: result.value.nextCursor,
    },
  };
}
