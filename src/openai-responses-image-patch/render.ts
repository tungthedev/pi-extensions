import fs from "node:fs";
import path from "node:path";

import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Box, Image, Markdown, Spacer, Text } from "@mariozechner/pi-tui";

import type { GeneratedImageDetails } from "./types.ts";

export const GENERATED_IMAGE_CUSTOM_TYPE = "openai-generated-image";

function renderMarkdown(details: Partial<GeneratedImageDetails> | undefined): string {
  if (!details) return "generated image details missing";
  return `**Generated image**\n${details.path ? `[${details.path}](${details.path})` : "not written to disk"}`;
}

function loadImageBase64(details: Partial<GeneratedImageDetails> | undefined): string | undefined {
  if (details?.imageBase64) return details.imageBase64;
  if (!details?.path) return undefined;
  try {
    return fs.readFileSync(details.path).toString("base64");
  } catch {
    return undefined;
  }
}

export function registerGeneratedImageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(GENERATED_IMAGE_CUSTOM_TYPE, (message, _options, theme) => {
    const details = message.details as Partial<GeneratedImageDetails> | undefined;
    const box = new Box(1, 0);
    box.addChild(new Markdown(renderMarkdown(details), 0, 0, getMarkdownTheme()));
    if (details?.error) {
      box.addChild(new Text(theme.fg("error", details.error), 0, 0));
    }

    const imageBase64 = loadImageBase64(details);
    if (!imageBase64 || !details?.mimeType) return box;

    box.addChild(new Spacer(1));
    box.addChild(
      new Image(
        imageBase64,
        details.mimeType,
        { fallbackColor: (text) => theme.fg("dim", text) },
        { maxWidthCells: 80, filename: details.path ? path.basename(details.path) : undefined },
      ),
    );
    return box;
  });
}
