export const ROOT_TASK_PATH = "/root";

const TASK_SEGMENT_RE = /^[a-z0-9_-]+$/;

export type TaskPathRecord = {
  agentId: string;
  name?: string;
  taskPath?: string;
};

export function validateTaskSegment(value: string | undefined, fieldName = "task_name"): string {
  const segment = value?.trim() ?? "";
  if (!segment) {
    throw new Error(`${fieldName} is required`);
  }
  if (!TASK_SEGMENT_RE.test(segment)) {
    throw new Error(`${fieldName} must use lowercase letters, digits, underscores, and hyphens`);
  }
  return segment;
}

export function normalizeTaskPath(path: string | undefined): string {
  const normalized = (path?.trim() || ROOT_TASK_PATH).replace(/\/+$/g, "") || ROOT_TASK_PATH;
  if (normalized !== ROOT_TASK_PATH && !normalized.startsWith(`${ROOT_TASK_PATH}/`)) {
    throw new Error("task path must be /root or a descendant of /root");
  }
  for (const segment of normalized.split("/").slice(2)) {
    validateTaskSegment(segment, "task path segment");
  }
  return normalized;
}

export function buildChildTaskPath(parentTaskPath: string | undefined, taskName: string): string {
  return `${normalizeTaskPath(parentTaskPath)}/${validateTaskSegment(taskName)}`;
}

export function resolveTaskPathPrefix(currentTaskPath: string | undefined, pathPrefix: string | undefined): string | undefined {
  const trimmed = pathPrefix?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return normalizeTaskPath(trimmed);

  const relativeSegments = trimmed.replace(/\/+$/g, "").split("/");
  if (relativeSegments.some((segment) => segment.length === 0)) {
    throw new Error("path_prefix must use valid task path segments");
  }
  const validatedSegments = relativeSegments.map((segment) => validateTaskSegment(segment, "path_prefix segment"));
  return `${normalizeTaskPath(currentTaskPath)}/${validatedSegments.join("/")}`;
}

export function validateAgentTarget(target: string | undefined, fieldName = "target"): string {
  const normalized = target?.trim() ?? "";
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  if (normalized.startsWith("/")) {
    return normalizeTaskPath(normalized);
  }
  return validateTaskSegment(normalized, fieldName);
}

export function isDescendantTaskPath(parentTaskPath: string, candidateTaskPath: string): boolean {
  const parent = normalizeTaskPath(parentTaskPath);
  const candidate = normalizeTaskPath(candidateTaskPath);
  return candidate !== parent && candidate.startsWith(`${parent}/`);
}

export function resolveTaskTarget<T extends TaskPathRecord>(
  records: Iterable<T>,
  currentTaskPath: string | undefined,
  target: string,
  options: { allowLegacyNameFallback?: boolean } = {},
): T | undefined {
  const normalizedTarget = validateAgentTarget(target);
  const allRecords = Array.from(records);
  if (normalizedTarget.startsWith("/")) {
    return allRecords.find((record) => record.taskPath === normalizedTarget);
  }

  const candidatePath = buildChildTaskPath(currentTaskPath, normalizedTarget);
  const pathMatch = allRecords.find((record) => record.taskPath === candidatePath);
  if (pathMatch) return pathMatch;

  if (normalizeTaskPath(currentTaskPath) !== ROOT_TASK_PATH) {
    const rootPathMatch = allRecords.find((record) => record.taskPath === buildChildTaskPath(ROOT_TASK_PATH, normalizedTarget));
    if (rootPathMatch) return rootPathMatch;
  }

  if (options.allowLegacyNameFallback !== false) {
    return allRecords.find((record) => !record.taskPath && record.name === normalizedTarget);
  }

  return undefined;
}
