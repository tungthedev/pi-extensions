import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";

import { registerCodexCompatibilityTools } from "./compatibility-tools/index.ts";
import { installExplorationEventHandlers } from "./exploration/events.ts";
import { renderBashResult } from "./renderers/bash.ts";
import { renderEditResult } from "./renderers/edit.ts";
import { renderWriteResult } from "./renderers/write.ts";
import { codexArgs, withCodexArgs } from "./shared/tool-results.ts";

export default function codexContentRendering(pi: ExtensionAPI) {
  registerCodexCompatibilityTools(pi);
  installExplorationEventHandlers(pi);

  const cwd = process.cwd();
  const readTool = createReadTool(cwd);
  const grepTool = createGrepTool(cwd);
  const findTool = createFindTool(cwd);
  const lsTool = createLsTool(cwd);
  const bashTool = createBashTool(cwd);
  const editTool = createEditTool(cwd);
  const writeTool = createWriteTool(cwd);

  pi.registerTool({
    name: "read",
    label: "read",
    description: readTool.description,
    parameters: readTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await readTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(_result, { isPartial }) {
      if (isPartial) return undefined;
      return undefined;
    },
  });

  pi.registerTool({
    name: "grep",
    label: "grep",
    description: grepTool.description,
    parameters: grepTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await grepTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(_result, { isPartial }) {
      if (isPartial) return undefined;
      return undefined;
    },
  });

  pi.registerTool({
    name: "find",
    label: "find",
    description: findTool.description,
    parameters: findTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await findTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(_result, { isPartial }) {
      if (isPartial) return undefined;
      return undefined;
    },
  });

  pi.registerTool({
    name: "ls",
    label: "ls",
    description: lsTool.description,
    parameters: lsTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await lsTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(_result, { isPartial }) {
      if (isPartial) return undefined;
      return undefined;
    },
  });

  pi.registerTool({
    name: "bash",
    label: "bash",
    description: bashTool.description,
    parameters: bashTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await bashTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return undefined;
      return renderBashResult(theme, codexArgs(result) as { command?: string }, result, expanded);
    },
  });

  pi.registerTool({
    name: "edit",
    label: "edit",
    description: editTool.description,
    parameters: editTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await editTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return undefined;
      return renderEditResult(
        theme,
        codexArgs(result) as { path?: string; file_path?: string },
        result,
        expanded,
      );
    },
  });

  pi.registerTool({
    name: "write",
    label: "write",
    description: writeTool.description,
    parameters: writeTool.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return withCodexArgs(
        await writeTool.execute(toolCallId, params, signal, onUpdate),
        params as Record<string, unknown>,
      );
    },
    renderCall() {
      return undefined;
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return undefined;
      return renderWriteResult(
        theme,
        codexArgs(result) as { path?: string; file_path?: string; content?: string },
        result,
      );
    },
  });
}
