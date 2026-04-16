import type { FindToolInput } from "@mariozechner/pi-coding-agent";

import { FinderOperationError, RuntimeInitializationError } from "../errors.ts";
import { shouldUseLegacyPiFind } from "../query-classifier.ts";
import {
  buildScopedDiscoveryQuery,
  getFffRuntime,
  resolveAdapterPath,
  type FffAdapterContext,
} from "./common.ts";

export async function executePiFindWithFff(
  params: FindToolInput,
  ctx: FffAdapterContext,
  legacyExecute: () => Promise<any>,
): Promise<any> {
  if (shouldUseLegacyPiFind(params.pattern)) {
    return await legacyExecute();
  }

  const runtime = getFffRuntime(ctx);
  const query = await buildScopedDiscoveryQuery(runtime, ctx, params.path, params.pattern);
  if (!query) {
    return await legacyExecute();
  }

  const result = await runtime.findFiles({
    query,
    limit: Math.max(1, params.limit ?? 100),
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
      count: result.value.totalMatched ?? result.value.items.length,
    },
  };
}
