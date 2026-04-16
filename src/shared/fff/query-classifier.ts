export type DiscoveryRequest = {
  pattern: string;
  excludePatterns?: string | string[];
};

const STRICT_GLOB_TOKENS = ["*", "?", "[", "]", "{", "}"];
const REGEX_TOKENS = [
  /\\[AbBdDsSwWZz0-9]/,
  /\[[^\]]+\]/,
  /\([^)]*[|)][^)]*\)/,
  /(^|[^\\])[()]/,
  /[{}|^$]/,
  /\.([*+?])/,
  /(^|[^\\])[+?*]($|\s)/,
];

function normalizePattern(value: string): string {
  return value.trim();
}

export function isExplicitGlobPattern(pattern: string): boolean {
  const normalized = normalizePattern(pattern);
  return STRICT_GLOB_TOKENS.some((token) => normalized.includes(token));
}

export function isStrictGlobRequest(request: DiscoveryRequest): boolean {
  if (Array.isArray(request.excludePatterns) && request.excludePatterns.length > 0) return true;
  if (typeof request.excludePatterns === "string" && request.excludePatterns.trim()) return true;
  return isExplicitGlobPattern(request.pattern);
}

export function shouldUseFffForDiscovery(request: DiscoveryRequest): boolean {
  const normalized = normalizePattern(request.pattern);
  if (!normalized) return false;
  if (isStrictGlobRequest(request)) return false;
  return true;
}

export function looksLikeRegexPattern(pattern: string): boolean {
  return REGEX_TOKENS.some((regex) => regex.test(pattern));
}

export function inferFffGrepMode(params: {
  pattern: string;
  literal?: boolean;
}): "plain" | "regex" {
  if (params.literal) return "plain";
  return looksLikeRegexPattern(params.pattern) ? "regex" : "plain";
}

export function shouldUseLegacyCodexFind(pattern: string): boolean {
  return isExplicitGlobPattern(pattern);
}

export function shouldUseLegacyPiFind(pattern: string): boolean {
  return isExplicitGlobPattern(pattern);
}

export function shouldUseLegacyDroidGlob(params: {
  patterns: string | string[];
  excludePatterns?: string | string[];
}): boolean {
  if (Array.isArray(params.patterns) && params.patterns.length !== 1) return true;
  if (Array.isArray(params.excludePatterns) && params.excludePatterns.length > 0) return true;
  if (typeof params.excludePatterns === "string" && params.excludePatterns.trim()) return true;
  const pattern = Array.isArray(params.patterns) ? (params.patterns[0] ?? "") : params.patterns;
  return isExplicitGlobPattern(pattern);
}

export function shouldUseLegacyDroidGrep(params: {
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
}): boolean {
  return Boolean(
    params.case_insensitive ||
    params.type ||
    params.context_before ||
    params.context_after ||
    params.context ||
    params.line_numbers === false ||
    params.head_limit ||
    params.multiline ||
    params.fixed_string,
  );
}
