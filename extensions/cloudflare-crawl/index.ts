import type { AgentToolResult, ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  getMarkdownTheme,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  detailLine,
  expandHintLine,
  renderLines,
  titleLine,
} from "../codex-content/renderers/common.ts";
import { firstText, previewLines, shortenText } from "../codex-content/shared/text.ts";

const TOOL_NAME = "crawl_page";
const TOOL_LABEL = "Crawl page";
const NOTIFICATION_CUSTOM_TYPE = "cloudflare-crawl-notification";
const DEFAULT_TIMEOUT_SECONDS = 90;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 600;
const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 2;
const POLL_INTERVAL_MS = 1_500;
const COLLAPSED_PREVIEW_LINE_COUNT = 4;

function getBackgroundNotificationDeliveryOptions(parentIsStreaming: boolean):
  | { deliverAs: "followUp" }
  | { triggerTurn: true } {
  return parentIsStreaming ? { deliverAs: "followUp" } : { triggerTurn: true };
}

type CrawlOutputFormat = "markdown" | "html";
type CrawlJobStatus =
  | "running"
  | "completed"
  | "errored"
  | "cancelled_due_to_timeout"
  | "cancelled_due_to_limits"
  | "cancelled_by_user";

type ClawlPageParams = {
  url: string;
  wait_for_completion?: boolean;
  depth?: number;
  format?: string;
  timeout_seconds?: number;
};

type CloudflareApiEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
};

type CloudflareCrawlRecord = {
  url?: string;
  status?: string;
  markdown?: string;
  html?: string;
  metadata?: {
    status?: number;
    title?: string;
    url?: string;
  };
};

type CloudflareCrawlJob = {
  id?: string;
  status?: CrawlJobStatus;
  browserSecondsUsed?: number;
  total?: number;
  finished?: number;
  records?: CloudflareCrawlRecord[];
  cursor?: number | string;
};

type CrawlRecordSummary = {
  url: string;
  status: string;
  title?: string;
  http_status?: number;
};

type ClawlPageResultDetails = {
  job_id: string;
  url: string;
  depth: number;
  format: CrawlOutputFormat;
  wait_for_completion: boolean;
  status: CrawlJobStatus | "timed_out";
  total?: number;
  finished?: number;
  pages_fetched?: number;
  browser_seconds_used?: number;
  preview_text?: string;
  render_markdown?: string;
  render_text?: string;
  full_output_path?: string;
  records?: CrawlRecordSummary[];
  error?: string;
  parent_session_file?: string;
};

type CrawlToolResult = AgentToolResult<ClawlPageResultDetails> & { isError?: boolean };

function resolveCloudflareConfig(): { accountId: string; apiToken: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken =
    process.env.CLOUDFLARE_BROWSER_RENDERING_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not set.");
  }
  if (!apiToken) {
    throw new Error("CLOUDFLARE_BROWSER_RENDERING_API_TOKEN or CLOUDFLARE_API_TOKEN is not set.");
  }

  return { accountId, apiToken };
}

function clampDepth(depth: number | undefined): number {
  const normalized = Number.isFinite(depth) ? Math.floor(depth ?? DEFAULT_DEPTH) : DEFAULT_DEPTH;
  return Math.max(0, Math.min(MAX_DEPTH, normalized));
}

function normalizeFormat(format: string | undefined): CrawlOutputFormat {
  return format?.trim().toLowerCase() === "html" ? "html" : "markdown";
}

function normalizeTimeoutSeconds(timeoutSeconds: number | undefined): number {
  const normalized = Number.isFinite(timeoutSeconds)
    ? Math.floor(timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)
    : DEFAULT_TIMEOUT_SECONDS;
  return Math.max(MIN_TIMEOUT_SECONDS, Math.min(MAX_TIMEOUT_SECONDS, normalized));
}

function limitForDepth(depth: number): number {
  switch (depth) {
    case 0:
      return 1;
    case 1:
      return 10;
    default:
      return 25;
  }
}

function isTerminalStatus(status: string | undefined): status is CrawlJobStatus {
  return Boolean(
    status &&
    [
      "completed",
      "errored",
      "cancelled_due_to_timeout",
      "cancelled_due_to_limits",
      "cancelled_by_user",
    ].includes(status),
  );
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("crawl aborted"));
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

async function cloudflareRequest<T>(
  pathname: string,
  init: RequestInit = {},
): Promise<CloudflareApiEnvelope<T>> {
  const { accountId, apiToken } = resolveCloudflareConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiToken}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl${pathname}`,
    {
      ...init,
      headers,
    },
  );

  let body: CloudflareApiEnvelope<T> | undefined;
  try {
    body = (await response.json()) as CloudflareApiEnvelope<T>;
  } catch {
    body = undefined;
  }

  if (!response.ok || !body?.success) {
    const message = body?.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || `Cloudflare crawl request failed (${response.status})`);
  }

  return body;
}

async function startCrawlJob(
  url: string,
  depth: number,
  format: CrawlOutputFormat,
): Promise<string> {
  const response = await cloudflareRequest<string>("", {
    method: "POST",
    body: JSON.stringify({
      url,
      depth,
      limit: limitForDepth(depth),
      formats: [format],
      render: true,
      source: "all",
      crawlPurposes: ["search"],
    }),
  });

  const jobId = response.result?.trim();
  if (!jobId) {
    throw new Error("Cloudflare crawl did not return a job id.");
  }

  return jobId;
}

async function getCrawlJob(jobId: string): Promise<CloudflareCrawlJob> {
  const response = await cloudflareRequest<CloudflareCrawlJob>(`/${jobId}`);
  return response.result ?? {};
}

function summarizeRecords(records: CloudflareCrawlRecord[] | undefined): CrawlRecordSummary[] {
  return (records ?? []).map((record) => ({
    url: record.metadata?.url?.trim() || record.url?.trim() || "(unknown URL)",
    status: record.status?.trim() || "unknown",
    title: record.metadata?.title?.trim() || undefined,
    http_status: typeof record.metadata?.status === "number" ? record.metadata.status : undefined,
  }));
}

function extractRecordBody(record: CloudflareCrawlRecord, format: CrawlOutputFormat): string {
  return format === "html" ? record.html?.trim() || "" : record.markdown?.trim() || "";
}

function formatPageBlock(
  record: CloudflareCrawlRecord,
  format: CrawlOutputFormat,
  index: number,
): string | undefined {
  const body = extractRecordBody(record, format);
  if (!body) return undefined;

  const url = record.metadata?.url?.trim() || record.url?.trim() || "(unknown URL)";
  const title = record.metadata?.title?.trim();
  const header = [`## Page ${index + 1}`, `URL: ${url}`, title ? `Title: ${title}` : ""]
    .filter(Boolean)
    .join("\n");

  return `${header}\n\n${body}`.trim();
}

async function writeFullOutputFile(jobId: string, content: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "pi-cloudflare-crawl-"));
  const filePath = path.join(directory, `${jobId}.txt`);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

async function buildCompletedResult(
  jobId: string,
  url: string,
  depth: number,
  format: CrawlOutputFormat,
  waitForCompletion: boolean,
  job: CloudflareCrawlJob,
): Promise<CrawlToolResult> {
  const records = job.records ?? [];
  const completedBlocks = records
    .filter((record) => record.status === "completed")
    .map((record, index) => formatPageBlock(record, format, index))
    .filter((value): value is string => Boolean(value));

  if (job.status !== "completed") {
    throw new Error(`Cloudflare crawl ${jobId} ended with status ${job.status ?? "unknown"}.`);
  }

  if (completedBlocks.length === 0) {
    throw new Error(`Cloudflare crawl ${jobId} completed without any page content.`);
  }

  const fullContent = completedBlocks.join("\n\n---\n\n");
  const truncation = truncateHead(fullContent, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let toolText = truncation.content;
  let fullOutputPath: string | undefined;
  if (truncation.truncated) {
    fullOutputPath = await writeFullOutputFile(jobId, fullContent);
    const omittedLines = truncation.totalLines - truncation.outputLines;
    toolText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    toolText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    toolText += ` ${omittedLines} lines omitted. Full output saved to: ${fullOutputPath}]`;
  }

  return {
    content: [{ type: "text", text: toolText }],
    details: {
      job_id: jobId,
      url,
      depth,
      format,
      wait_for_completion: waitForCompletion,
      status: "completed",
      total: job.total,
      finished: job.finished,
      pages_fetched: completedBlocks.length,
      browser_seconds_used: job.browserSecondsUsed,
      preview_text: toolText,
      ...(format === "markdown" ? { render_markdown: toolText } : { render_text: toolText }),
      ...(fullOutputPath ? { full_output_path: fullOutputPath } : {}),
      records: summarizeRecords(records),
    },
  };
}

async function waitForCrawlCompletion(options: {
  jobId: string;
  url: string;
  depth: number;
  format: CrawlOutputFormat;
  waitForCompletion: boolean;
  timeoutSeconds: number;
  signal?: AbortSignal;
  onUpdate?: (result: CrawlToolResult) => void;
}): Promise<CrawlToolResult> {
  const deadline = Date.now() + options.timeoutSeconds * 1_000;

  while (true) {
    if (options.signal?.aborted) {
      throw new Error("crawl aborted");
    }

    const job = await getCrawlJob(options.jobId);
    const status = job.status?.trim() || "running";

    if (isTerminalStatus(status)) {
      return await buildCompletedResult(
        options.jobId,
        options.url,
        options.depth,
        options.format,
        options.waitForCompletion,
        job,
      );
    }

    options.onUpdate?.({
      content: [
        {
          type: "text",
          text: `Crawl ${options.jobId} is ${status}. ${job.finished ?? 0}/${job.total ?? "?"} pages processed.`,
        },
      ],
      details: {
        job_id: options.jobId,
        url: options.url,
        depth: options.depth,
        format: options.format,
        wait_for_completion: options.waitForCompletion,
        status: "running",
        total: job.total,
        finished: job.finished,
        preview_text: `Crawl in progress: ${job.finished ?? 0}/${job.total ?? "?"} pages processed.`,
        records: summarizeRecords(job.records),
      },
    });

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(
        `Timed out waiting for Cloudflare crawl ${options.jobId} after ${options.timeoutSeconds}s.`,
      );
    }

    await sleep(Math.min(POLL_INTERVAL_MS, remainingMs), options.signal);
  }
}

function summarizeJobSubject(details: ClawlPageResultDetails): string {
  return shortenText(details.url, 96, "URL");
}

function previewDetailLines(details: ClawlPageResultDetails): {
  visible: string[];
  hiddenCount: number;
} {
  const visible = previewLines(details.preview_text ?? "", COLLAPSED_PREVIEW_LINE_COUNT);
  const total = previewLines(
    details.render_markdown ?? details.render_text ?? "",
    Number.MAX_SAFE_INTEGER,
  ).length;

  return {
    visible,
    hiddenCount: Math.max(0, total - visible.length),
  };
}

function resultTitle(details: ClawlPageResultDetails, failed: boolean): string {
  if (details.status === "running") return "Started crawl";
  if (failed) return "Crawl failed";
  return "Crawled";
}

function resultSuffix(theme: Theme, details: ClawlPageResultDetails, failed: boolean): string {
  const subject = theme.fg(failed ? "error" : "accent", summarizeJobSubject(details));
  const meta: string[] = [];

  if (typeof details.pages_fetched === "number") {
    meta.push(`${details.pages_fetched} page${details.pages_fetched === 1 ? "" : "s"}`);
  }
  meta.push(`depth ${details.depth}`);
  meta.push(details.format);
  if (details.job_id) {
    meta.push(details.job_id.slice(0, 8));
  }

  return `${subject}${theme.fg("dim", ` (${meta.join(" • ")})`)}`;
}

function renderResultBody(
  details: ClawlPageResultDetails,
  result: AgentToolResult<unknown>,
  theme: Theme,
  expanded: boolean,
): Container | Text {
  const failed = (result as AgentToolResult<unknown> & { isError?: boolean }).isError === true;
  const lines = [
    titleLine(
      theme,
      failed ? "error" : details.status === "running" ? "accent" : "text",
      resultTitle(details, failed),
      resultSuffix(theme, details, failed),
    ),
  ];

  if (failed) {
    const errorLines = previewLines(details.error ?? firstText(result), expanded ? 6 : 3);
    for (const [index, line] of errorLines.entries()) {
      lines.push(detailLine(theme, line, index === 0));
    }
    return renderLines(lines);
  }

  if (!expanded) {
    const preview = previewDetailLines(details);
    if (preview.visible.length > 0) {
      for (const [index, line] of preview.visible.entries()) {
        lines.push(detailLine(theme, line, index === 0));
      }
    } else if (details.status === "running") {
      lines.push(
        detailLine(
          theme,
          `Polling in ${details.wait_for_completion ? "foreground" : "background"}.`,
          true,
        ),
      );
    }

    if (preview.hiddenCount > 0) {
      lines.push(expandHintLine(theme, preview.hiddenCount, "line"));
    }

    return renderLines(lines);
  }

  const container = new Container();
  container.addChild(new Text(lines[0], 0, 0));

  if (details.render_markdown) {
    container.addChild(new Spacer(1));
    container.addChild(new Markdown(details.render_markdown, 0, 0, getMarkdownTheme()));
  } else if (details.render_text) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(details.render_text, 0, 0));
  }

  if (details.full_output_path) {
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(detailLine(theme, `Full output: ${details.full_output_path}`, true), 0, 0),
    );
  }

  return container;
}

function normalizeParams(rawParams: unknown): {
  url: string;
  waitForCompletion: boolean;
  depth: number;
  format: CrawlOutputFormat;
  timeoutSeconds: number;
} {
  const params = rawParams as ClawlPageParams;
  const url = params.url?.trim();
  if (!url) {
    throw new Error("url is required");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`invalid URL: "${params.url}" — must start with http:// or https://`);
  }

  return {
    url,
    waitForCompletion: params.wait_for_completion ?? true,
    depth: clampDepth(params.depth),
    format: normalizeFormat(params.format),
    timeoutSeconds: normalizeTimeoutSeconds(params.timeout_seconds),
  };
}

export default function cloudflareCrawl(pi: ExtensionAPI) {
  let parentIsStreaming = false;
  let activeSessionFile: string | undefined;
  const backgroundJobs = new Map<string, Promise<void>>();

  const hasCloudflareConfig = (): boolean => {
    try {
      resolveCloudflareConfig();
      return true;
    } catch {
      return false;
    }
  };

  const syncToolAvailability = () => {
    if (hasCloudflareConfig()) {
      return;
    }

    const activeToolNames = pi.getActiveTools();
    if (!activeToolNames.includes(TOOL_NAME)) {
      return;
    }

    pi.setActiveTools(activeToolNames.filter((toolName) => toolName !== TOOL_NAME));
  };

  const shouldNotifySession = (sessionFile: string | undefined): boolean => {
    if (!sessionFile || !activeSessionFile) return true;
    return sessionFile === activeSessionFile;
  };

  const sendBackgroundNotification = (
    result: CrawlToolResult,
    parentSessionFile: string | undefined,
  ) => {
    const details = {
      ...result.details,
      parent_session_file: parentSessionFile,
    };

    if (!shouldNotifySession(parentSessionFile)) {
      return;
    }

    pi.sendMessage(
      {
        customType: NOTIFICATION_CUSTOM_TYPE,
        content:
          details.status === "completed"
            ? `Background crawl completed for ${details.url}`
            : `Background crawl failed for ${details.url}: ${details.error ?? details.status}`,
        display: true,
        details,
      },
      getBackgroundNotificationDeliveryOptions(parentIsStreaming),
    );
  };

  pi.on("session_start", async (_event, ctx) => {
    activeSessionFile = ctx.sessionManager.getSessionFile() ?? undefined;
    syncToolAvailability();
  });

  pi.on("session_switch", async (_event, ctx) => {
    activeSessionFile = ctx.sessionManager.getSessionFile() ?? undefined;
    syncToolAvailability();
  });

  pi.on("before_agent_start", async () => {
    syncToolAvailability();
  });

  pi.on("agent_start", async () => {
    parentIsStreaming = true;
  });

  pi.on("agent_end", async () => {
    parentIsStreaming = false;
  });

  pi.registerMessageRenderer<ClawlPageResultDetails>(
    NOTIFICATION_CUSTOM_TYPE,
    (message, { expanded }, theme) => {
      const details = message.details as ClawlPageResultDetails | undefined;
      if (!details) {
        return new Text(typeof message.content === "string" ? message.content : "", 0, 0);
      }

      return renderResultBody(details, { content: [], details }, theme, expanded);
    },
  );

  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description:
      "Fetch actual web page content through Cloudflare Browser Rendering. " +
      "Can wait for completion or run in the background and notify when ready. " +
      "Depth defaults to 1 and is clamped low to avoid crawl explosion.",
    promptSnippet:
      "Fetch actual web page content with Cloudflare Browser Rendering; supports foreground waiting or background notifications.",
    promptGuidelines: [
      "Use crawl_page when you need real page content instead of an LLM summary, especially for JS-rendered pages.",
      "Keep depth low unless the user explicitly wants a small multi-page crawl.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to crawl. Must start with http:// or https://." }),
      wait_for_completion: Type.Optional(
        Type.Boolean({
          description:
            "If true (default), keep polling until the crawl completes or times out. If false, return immediately and notify later.",
        }),
      ),
      depth: Type.Optional(
        Type.Number({
          description:
            "Optional crawl depth. Defaults to 1 and is clamped to a small safe maximum.",
        }),
      ),
      format: Type.Optional(
        Type.String({ description: 'Optional output format: "markdown" (default) or "html".' }),
      ),
      timeout_seconds: Type.Optional(
        Type.Number({
          description: `Optional timeout while waiting for completion (default: ${DEFAULT_TIMEOUT_SECONDS}).`,
        }),
      ),
    }),
    async execute(_toolCallId, rawParams, signal, onUpdate, ctx) {
      const params = normalizeParams(rawParams);
      const jobId = await startCrawlJob(params.url, params.depth, params.format);

      if (!params.waitForCompletion) {
        const parentSessionFile = ctx.sessionManager.getSessionFile() ?? undefined;
        const jobPromise = waitForCrawlCompletion({
          jobId,
          url: params.url,
          depth: params.depth,
          format: params.format,
          waitForCompletion: false,
          timeoutSeconds: params.timeoutSeconds,
        })
          .then((result) => sendBackgroundNotification(result, parentSessionFile))
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            sendBackgroundNotification(
              {
                content: [{ type: "text", text: message }],
                details: {
                  job_id: jobId,
                  url: params.url,
                  depth: params.depth,
                  format: params.format,
                  wait_for_completion: false,
                  status: message.toLowerCase().includes("timed out") ? "timed_out" : "errored",
                  error: message,
                  preview_text: message,
                  parent_session_file: parentSessionFile,
                },
                isError: true,
              },
              parentSessionFile,
            );
          })
          .finally(() => {
            backgroundJobs.delete(jobId);
          });

        backgroundJobs.set(jobId, jobPromise);

        return {
          content: [
            {
              type: "text",
              text: `Started Cloudflare crawl job ${jobId} for ${params.url}. Polling in the background.`,
            },
          ],
          details: {
            job_id: jobId,
            url: params.url,
            depth: params.depth,
            format: params.format,
            wait_for_completion: false,
            status: "running",
            preview_text: `Background crawl started for ${params.url}`,
            parent_session_file: parentSessionFile,
          },
        };
      }

      return await waitForCrawlCompletion({
        jobId,
        url: params.url,
        depth: params.depth,
        format: params.format,
        waitForCompletion: true,
        timeoutSeconds: params.timeoutSeconds,
        signal,
        onUpdate,
      });
    },
    renderCall(rawArgs, theme) {
      const params = normalizeParams(rawArgs);
      const suffix = `${theme.fg("accent", shortenText(params.url, 96, params.url))}${theme.fg(
        "dim",
        ` (depth ${params.depth} • ${params.format}${params.waitForCompletion ? "" : " • async"})`,
      )}`;
      return new Text(titleLine(theme, "text", "Crawling", suffix), 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as ClawlPageResultDetails | undefined;
      if (!details) return undefined;

      if (isPartial) {
        return new Text(
          titleLine(theme, "accent", "Crawling", resultSuffix(theme, details, false)),
          0,
          0,
        );
      }

      return renderResultBody(details, result, theme, expanded);
    },
  });
}
