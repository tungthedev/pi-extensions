import { matchesKey } from "@mariozechner/pi-tui";

export interface TextEditorState {
  buffer: string;
  cursor: number;
  viewportOffset: number;
}

export interface TextEditorOptions {
  multiLine?: boolean;
}

export function createEditorState(initial = ""): TextEditorState {
  return {
    buffer: initial,
    cursor: initial.length,
    viewportOffset: 0,
  };
}

export function wrapText(text: string, width: number): { lines: string[]; starts: number[] } {
  const lines: string[] = [];
  const starts: number[] = [];

  if (width <= 0) return { lines: [text], starts: [0] };
  if (text.length === 0) return { lines: [""], starts: [0] };

  const segments = text.split("\n");
  let offset = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] ?? "";
    if (segment.length === 0) {
      starts.push(offset);
      lines.push("");
    } else {
      let position = 0;
      while (position < segment.length) {
        starts.push(offset + position);
        lines.push(segment.slice(position, position + width));
        position += width;
      }
    }
    offset += segment.length;
    if (i < segments.length - 1) offset += 1;
  }

  const lastLine = lines[lines.length - 1] ?? "";
  if (!text.endsWith("\n") && lastLine.length === width) {
    starts.push(text.length);
    lines.push("");
  }

  return { lines, starts };
}

export function getCursorDisplayPos(cursor: number, starts: number[]): { line: number; col: number } {
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (cursor >= starts[index]!) {
      return { line: index, col: cursor - starts[index]! };
    }
  }
  return { line: 0, col: 0 };
}

export function ensureCursorVisible(cursorLine: number, viewportHeight: number, currentOffset: number): number {
  if (cursorLine < currentOffset) return cursorLine;
  if (cursorLine >= currentOffset + viewportHeight) return cursorLine - viewportHeight + 1;
  return Math.max(0, currentOffset);
}

function isWordChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function wordBackward(buffer: string, cursor: number): number {
  let position = cursor;
  while (position > 0 && !isWordChar(buffer[position - 1]!)) position -= 1;
  while (position > 0 && isWordChar(buffer[position - 1]!)) position -= 1;
  return position;
}

function wordForward(buffer: string, cursor: number): number {
  const length = buffer.length;
  let position = cursor;
  while (position < length && isWordChar(buffer[position]!)) position += 1;
  while (position < length && !isWordChar(buffer[position]!)) position += 1;
  return position;
}

function normalizeInsertText(data: string, multiLine: boolean): string | null {
  let text = data.split("\u001b[200~").join("").split("\u001b[201~").join("");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ");
  if (!multiLine) {
    const newlineIndex = text.indexOf("\n");
    if (newlineIndex !== -1) text = text.slice(0, newlineIndex);
  }
  if (!text) return null;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 && !(multiLine && text[index] === "\n")) return null;
  }
  return text;
}

export function handleEditorInput(
  state: TextEditorState,
  data: string,
  width: number,
  options?: TextEditorOptions,
): TextEditorState | null {
  const multiLine = options?.multiLine === true;
  if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) return null;
  if (matchesKey(data, "return")) {
    if (!multiLine) return null;
    return {
      ...state,
      buffer: `${state.buffer.slice(0, state.cursor)}\n${state.buffer.slice(state.cursor)}`,
      cursor: state.cursor + 1,
    };
  }

  const { lines, starts } = wrapText(state.buffer, width);
  const cursorPos = getCursorDisplayPos(state.cursor, starts);

  if (matchesKey(data, "alt+left") || matchesKey(data, "ctrl+left")) return { ...state, cursor: wordBackward(state.buffer, state.cursor) };
  if (matchesKey(data, "alt+right") || matchesKey(data, "ctrl+right")) return { ...state, cursor: wordForward(state.buffer, state.cursor) };
  if (matchesKey(data, "left")) return { ...state, cursor: Math.max(0, state.cursor - 1) };
  if (matchesKey(data, "right")) return { ...state, cursor: Math.min(state.buffer.length, state.cursor + 1) };
  if (matchesKey(data, "up")) {
    if (cursorPos.line === 0) return state;
    const targetLine = cursorPos.line - 1;
    const targetCol = Math.min(cursorPos.col, lines[targetLine]?.length ?? 0);
    return { ...state, cursor: starts[targetLine]! + targetCol };
  }
  if (matchesKey(data, "down")) {
    if (cursorPos.line >= lines.length - 1) return state;
    const targetLine = cursorPos.line + 1;
    const targetCol = Math.min(cursorPos.col, lines[targetLine]?.length ?? 0);
    return { ...state, cursor: starts[targetLine]! + targetCol };
  }
  if (matchesKey(data, "home")) return { ...state, cursor: starts[cursorPos.line]! };
  if (matchesKey(data, "end")) return { ...state, cursor: starts[cursorPos.line]! + (lines[cursorPos.line]?.length ?? 0) };
  if (matchesKey(data, "ctrl+home")) return { ...state, cursor: 0 };
  if (matchesKey(data, "ctrl+end")) return { ...state, cursor: state.buffer.length };
  if (matchesKey(data, "alt+backspace")) {
    const target = wordBackward(state.buffer, state.cursor);
    return {
      ...state,
      buffer: `${state.buffer.slice(0, target)}${state.buffer.slice(state.cursor)}`,
      cursor: target,
    };
  }
  if (matchesKey(data, "backspace")) {
    if (state.cursor === 0) return state;
    return {
      ...state,
      buffer: `${state.buffer.slice(0, state.cursor - 1)}${state.buffer.slice(state.cursor)}`,
      cursor: state.cursor - 1,
    };
  }
  if (matchesKey(data, "delete")) {
    if (state.cursor >= state.buffer.length) return state;
    return {
      ...state,
      buffer: `${state.buffer.slice(0, state.cursor)}${state.buffer.slice(state.cursor + 1)}`,
    };
  }

  const insert = normalizeInsertText(data, multiLine);
  if (!insert) return null;
  return {
    ...state,
    buffer: `${state.buffer.slice(0, state.cursor)}${insert}${state.buffer.slice(state.cursor)}`,
    cursor: state.cursor + insert.length,
  };
}

function renderWithCursor(text: string, cursorPos: number): string {
  const before = text.slice(0, cursorPos);
  const cursorChar = text[cursorPos] ?? " ";
  const after = text.slice(cursorPos + 1);
  return `${before}\x1b[7m${cursorChar}\x1b[27m${after}`;
}

export function renderEditor(state: TextEditorState, width: number, viewportHeight: number): string[] {
  const { lines, starts } = wrapText(state.buffer, width);
  const cursorPos = getCursorDisplayPos(state.cursor, starts);
  const rendered: string[] = [];
  for (let index = 0; index < viewportHeight; index += 1) {
    const lineIndex = state.viewportOffset + index;
    if (lineIndex >= lines.length) {
      rendered.push("");
      continue;
    }
    const line = lines[lineIndex] ?? "";
    rendered.push(lineIndex === cursorPos.line ? renderWithCursor(line, cursorPos.col) : line);
  }
  return rendered;
}
