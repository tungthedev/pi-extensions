import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import { Box, truncateToWidth } from "@mariozechner/pi-tui";

import type { RenderCache } from "./render.ts";
import type { DiagramEntry } from "./session-index.ts";

import { extractMermaidBlocks, captureContextSlice, extractText } from "./extract.ts";
import { createCache, pickBestPreset, hashCode } from "./render.ts";
import { indexSessionDiagrams } from "./session-index.ts";
import { openMermaidViewer } from "./viewer.ts";

export type { DiagramEntry } from "./session-index.ts";

export default function mermaidInlineExtension(pi: ExtensionAPI) {
  const CUSTOM_TYPE = "mermaid-inline";
  const MAX_CODE_LENGTH = 20_000;
  const MAX_DIAGRAMS = 100;
  const cache: RenderCache = createCache();
  let diagrams: DiagramEntry[] = [];

  function syncDiagramsFromSession(ctx: Pick<ExtensionContext, "sessionManager">): void {
    diagrams = indexSessionDiagrams(ctx.sessionManager.getBranch() as never, { maxCodeLength: MAX_CODE_LENGTH }).slice(-MAX_DIAGRAMS);
  }

  /**
   * details contains the full DiagramEntry, not just an ID reference.
   * this makes rendering self-contained — survives reload, resume, etc.
   * the in-memory store is only needed for the viewer's diagram list.
   */
  pi.registerMessageRenderer(CUSTOM_TYPE, (message, { expanded: _expanded }, theme) => {
    const entry = message.details as DiagramEntry | undefined;

    const component = {
      /** width is already inner width — Box(1,1) subtracts padding before calling render */
      render(width: number): string[] {
        if (!entry?.block?.code) {
          return [truncateToWidth(theme.fg("dim", "diagram not found"), width)];
        }

        try {
          const { preset, rendered, overflowed } = pickBestPreset(cache, entry.block.code, width);

          const lines: string[] = [];

          let label = theme.fg("customMessageLabel", theme.bold("mermaid"));
          if (overflowed) label += " " + theme.fg("dim", `[${preset.key}]`);
          lines.push(label);

          for (const line of rendered.lines) {
            lines.push(line);
          }

          if (overflowed) {
            lines.push(theme.fg("dim", "diagram wider than terminal — ctrl+shift+m to view full"));
          }

          return lines.map((l) => truncateToWidth(l, width));
        } catch (err) {
          return [
            truncateToWidth(
              theme.fg("dim", `render error: ${err instanceof Error ? err.message : String(err)}`),
              width,
            ),
          ];
        }
      },
      invalidate() {},
    };

    const box = new Box(1, 1, (t: string) => theme.bg("customMessageBg", t));
    box.addChild(component);
    return box;
  });

  pi.on("message_end", async (event, ctx) => {
    const msg = event.message;
    if (msg.role !== "assistant") return;
    if ((msg as any).customType === CUSTOM_TYPE) return;

    const text = extractText(msg.content);
    if (!text) return;

    const blocks = extractMermaidBlocks(text);
    if (blocks.length === 0) return;

    for (const block of blocks) {
      if (block.code.length > MAX_CODE_LENGTH) continue;

      const context = captureContextSlice(text, block, 5);
      const id = `${Date.now()}:${block.blockIndex}:${hashCode(block.code)}`;
      const entry: DiagramEntry = { id, block, context, source: "assistant" };
      addDiagram(entry);

      /**
       * deliverAs: "nextTurn" — message_end fires while isStreaming is still true.
       * without this, sendMessage defaults to steer(), injecting a role:"custom"
       * message into the active agent loop. models that reject assistant prefill
       * (e.g. claude opus) then error because the conversation ends non-user.
       */
      pi.sendMessage(
        {
          customType: CUSTOM_TYPE,
          content: "",
          display: true,
          details: entry,
        },
        { deliverAs: "nextTurn" },
      );
    }

    syncDiagramsFromSession(ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return;
    const text = typeof event.text === "string" ? event.text : "";
    if (!text) return { action: "continue" as const };

    const blocks = extractMermaidBlocks(text);
    if (blocks.length === 0) return { action: "continue" as const };

    for (const block of blocks) {
      if (block.code.length > MAX_CODE_LENGTH) continue;

      const context = captureContextSlice(text, block, 5);
      const id = `${Date.now()}:${block.blockIndex}:${hashCode(block.code)}`;
      const entry: DiagramEntry = { id, block, context, source: "user" };
      addDiagram(entry);

      pi.sendMessage(
        {
          customType: CUSTOM_TYPE,
          content: "",
          display: true,
          details: entry,
        },
        { deliverAs: "nextTurn" },
      );
    }

    syncDiagramsFromSession(ctx);

    return { action: "continue" as const };
  });

  pi.on("context", async (event) => {
    return {
      messages: event.messages.filter((m: any) => m.customType !== CUSTOM_TYPE),
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    syncDiagramsFromSession(ctx);
  });

  pi.registerShortcut("ctrl+shift+m", {
    description: "View mermaid diagrams",
    handler: async (ctx) => {
      if (diagrams.length === 0) {
        syncDiagramsFromSession(ctx);
      }
      if (diagrams.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("no mermaid diagrams in session", "info");
        return;
      }
      await openMermaidViewer({ ctx, diagrams, cache });
    },
  });

  pi.registerCommand("mermaid", {
    description: "Open mermaid diagram viewer",
    handler: async (_args, ctx) => {
      if (diagrams.length === 0) {
        syncDiagramsFromSession(ctx);
      }
      if (diagrams.length === 0) {
        if (ctx.hasUI) ctx.ui.notify("no mermaid diagrams in session", "info");
        return;
      }
      await openMermaidViewer({ ctx, diagrams, cache });
    },
  });

  function addDiagram(entry: DiagramEntry) {
    diagrams.push(entry);
    if (diagrams.length > MAX_DIAGRAMS) {
      diagrams = diagrams.slice(-MAX_DIAGRAMS);
    }
  }
}
