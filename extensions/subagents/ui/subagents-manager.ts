import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

import { notifyLegacyRoleWarnings } from "../subagents/legacy-role-warnings.ts";
import { resolveRoleSet } from "../subagents/roles-discovery.ts";
import { deleteRole, renameRole, saveRole } from "../subagents/roles-storage.ts";
import type { LayeredRoleRecord, RoleThinkingLevel } from "../subagents/roles-types.ts";
import { renderDetail, handleDetailInput, type SubagentsDetailState } from "./subagents-detail.ts";
import {
  buildListEntries,
  buildRoleKey,
  handleListInput,
  renderList,
  type SubagentsListEntry,
  type SubagentsListState,
} from "./subagents-list.ts";
import {
  DEFAULT_MODEL_HINT,
  MANUAL_MODEL_HINT,
  THINKING_LEVELS,
  filterModelOptions,
  getVisibleModelOptions,
  toModelOptions,
  validateManualModelInput,
  type ModelOption,
  type ThinkingLevel,
} from "./subagents-edit.ts";
import {
  createEditorState,
  ensureCursorVisible,
  getCursorDisplayPos,
  handleEditorInput,
  renderEditor,
  wrapText,
  type TextEditorState,
} from "./text-editor.ts";

const MAIN_PROMPT_VIEWPORT = 8;
const MODEL_SUGGESTION_VIEWPORT = 6;

type ManagerScreen =
  | "list"
  | "detail"
  | "scope-picker"
  | "edit-main"
  | "edit-model"
  | "confirm-delete";

type ScopePickerState = {
  mode: "create" | "override";
  focus: "main" | "model";
  sourceRole?: LayeredRoleRecord;
  selectedScope: "user" | "project";
};

type RoleDraftState = {
  scope: "user" | "project";
  existingRole?: LayeredRoleRecord;
  allowNameEdit: boolean;
  nameEditor: TextEditorState;
  descriptionEditor: TextEditorState;
  promptEditor: TextEditorState;
  modelEditor: TextEditorState;
  thinking: ThinkingLevel;
  mainFocus: "name" | "description" | "prompt";
  modelFocus: "model" | "thinking";
  modelCursor: number;
  error?: string;
};

function normalizeThinking(value: string | undefined): ThinkingLevel {
  return (value as ThinkingLevel | undefined) ?? "off";
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function renderHeader(title: string, width: number): string {
  const line = `${title} ${"─".repeat(Math.max(0, width - title.length - 1))}`;
  return line.slice(0, width);
}

function renderActiveCursorLabel(
  theme: ExtensionCommandContext["ui"]["theme"],
  label: string,
): string {
  return `${theme.fg("muted", "→ ")}${theme.fg("accent", label)}`;
}

export function formatScopeOptionLabel(
  scope: "user" | "project",
  targetDir: string,
  alreadyExists: boolean,
): string {
  const action = alreadyExists ? "save to" : "will create";
  return `${scope} (${action} ${targetDir})`;
}

export function resolveEditTarget(
  layeredRoles: LayeredRoleRecord[],
  role: LayeredRoleRecord,
  shadowedBy: LayeredRoleRecord["shadowedBy"],
): { role: LayeredRoleRecord; allowNameEdit: boolean } | undefined {
  if (!shadowedBy) return undefined;
  const effectiveOverride = layeredRoles.find((candidate) =>
    candidate.name === role.name && candidate.source === shadowedBy
  );
  if (!effectiveOverride) return undefined;
  return { role: effectiveOverride, allowNameEdit: false };
}

export function resolveCreateCancelTarget(_detailRoleKey: string | null): "list" {
  return "list";
}

function editorLines(editor: TextEditorState, width: number, height: number): string[] {
  const wrapped = wrapText(editor.buffer, width);
  const cursorPos = getCursorDisplayPos(editor.cursor, wrapped.starts);
  editor.viewportOffset = ensureCursorVisible(cursorPos.line, height, editor.viewportOffset);
  return renderEditor(editor, width, height);
}

class SubagentsManagerComponent {
  private screen: ManagerScreen = "list";
  private width = 80;
  private roleSet!: ReturnType<typeof resolveRoleSet>;
  private entries: SubagentsListEntry[] = [];
  private listState: SubagentsListState = { cursor: 0, scrollOffset: 0, query: "" };
  private detailRoleKey: string | null = null;
  private detailState: SubagentsDetailState = { scrollOffset: 0 };
  private scopePicker: ScopePickerState | null = null;
  private draft: RoleDraftState | null = null;
  private deleteRoleKey: string | null = null;
  private readonly modelOptions: ModelOption[];

  constructor(
    private readonly ctx: ExtensionCommandContext,
    availableModels: Array<{ provider: string; id: string }>,
    private readonly done: (value: undefined) => void,
  ) {
    this.roleSet = resolveRoleSet({ cwd: this.ctx.cwd });
    this.entries = buildListEntries(this.roleSet.layered);
    this.modelOptions = toModelOptions(availableModels);
    this.notifyWarnings();
  }

  private notifyWarnings() {
    const scopeKey = (this.ctx as { sessionManager?: { getSessionFile?: () => string | null } }).sessionManager?.getSessionFile?.() ?? this.ctx.cwd;
    notifyLegacyRoleWarnings(this.ctx, this.roleSet.warnings, scopeKey);
  }

  private refresh(selectedRoleKey?: string): void {
    this.roleSet = resolveRoleSet({ cwd: this.ctx.cwd });
    this.entries = buildListEntries(this.roleSet.layered);
    if (selectedRoleKey) this.detailRoleKey = selectedRoleKey;
  }

  private findRole(roleKey: string | null): LayeredRoleRecord | undefined {
    if (!roleKey) return undefined;
    return this.roleSet.layered.find((role) => buildRoleKey(role) === roleKey);
  }

  private openDetail(roleKey: string): void {
    this.detailRoleKey = roleKey;
    this.detailState = { scrollOffset: 0 };
    this.screen = "detail";
  }

  private openScopePicker(mode: ScopePickerState["mode"], focus: ScopePickerState["focus"], sourceRole?: LayeredRoleRecord): void {
    this.scopePicker = {
      mode,
      focus,
      sourceRole,
      selectedScope: this.roleSet.projectTargetDir ? "project" : "user",
    };
    this.screen = "scope-picker";
  }

  private buildDraft(scope: "user" | "project", existingRole?: LayeredRoleRecord, allowNameEdit = true): RoleDraftState {
    return {
      scope,
      existingRole,
      allowNameEdit,
      nameEditor: createEditorState(existingRole?.name ?? ""),
      descriptionEditor: createEditorState(existingRole?.description ?? ""),
      promptEditor: createEditorState(existingRole?.prompt ?? ""),
      modelEditor: createEditorState(existingRole?.model ?? ""),
      thinking: normalizeThinking(existingRole?.thinking),
      mainFocus: allowNameEdit ? "name" : "description",
      modelFocus: "model",
      modelCursor: 0,
    };
  }

  private startCreate(scope: "user" | "project"): void {
    this.draft = this.buildDraft(scope, undefined, true);
    this.screen = "edit-main";
  }

  private startOverride(role: LayeredRoleRecord, scope: "user" | "project", focus: "main" | "model"): void {
    this.draft = this.buildDraft(scope, role, false);
    this.screen = focus === "main" ? "edit-main" : "edit-model";
  }

  private startEdit(role: LayeredRoleRecord, focus: "main" | "model", allowNameEdit = true): void {
    this.draft = this.buildDraft(role.source as "user" | "project", role, allowNameEdit);
    this.screen = focus === "main" ? "edit-main" : "edit-model";
  }

  private saveDraft(): void {
    if (!this.draft) return;
    const name = this.draft.nameEditor.buffer.trim();
    const description = this.draft.descriptionEditor.buffer.trim();
    const prompt = this.draft.promptEditor.buffer.trim();
    if (!name) {
      this.draft.error = "Name is required.";
      return;
    }
    const model = trimOrUndefined(this.draft.modelEditor.buffer);
    const modelError = validateManualModelInput(model ?? "");
    if (modelError) {
      this.draft.error = modelError;
      this.screen = "edit-model";
      return;
    }

    const thinking = this.draft.thinking === "off" ? undefined : (this.draft.thinking as RoleThinkingLevel);

    const draft = this.draft;
    try {
      let savedName = name;
      if (draft.existingRole && draft.allowNameEdit && draft.existingRole.name !== name) {
        renameRole({
          cwd: this.ctx.cwd,
          scope: draft.scope,
          fromName: draft.existingRole.name,
          toName: name,
        });
        savedName = name;
      }

      const saved = saveRole({
        cwd: this.ctx.cwd,
        scope: draft.scope,
        overwrite: Boolean(draft.existingRole && draft.existingRole.source !== "builtin"),
        role: {
          name: savedName,
          description,
          prompt,
          model,
          thinking,
        },
      });
      const roleKey = buildRoleKey(saved);
      this.refresh(roleKey);
      this.draft = null;
      this.openDetail(roleKey);
    } catch (error) {
      draft.error = error instanceof Error ? error.message : String(error);
    }
  }

  private confirmDelete(roleKey: string): void {
    this.deleteRoleKey = roleKey;
    this.screen = "confirm-delete";
  }

  private deleteCurrentRole(): void {
    const role = this.findRole(this.deleteRoleKey);
    if (!role || role.source === "builtin") return;
    deleteRole({ cwd: this.ctx.cwd, scope: role.source, name: role.name });
    this.deleteRoleKey = null;
    this.detailRoleKey = null;
    this.refresh();
    this.screen = "list";
  }

  private renderScopePicker(): string[] {
    const lines = [renderHeader("Choose scope", this.width), "", "Where should this role be saved?", ""];
    const scopes = this.roleSet.projectTargetDir ? (["user", "project"] as const) : (["user"] as const);
    for (const scope of scopes) {
      const targetDir = scope === "user" ? this.roleSet.userDir : (this.roleSet.projectTargetDir ?? "project/.agents");
      const alreadyExists = scope === "user" ? true : Boolean(this.roleSet.projectDir);
      const detail = alreadyExists ? ` (save to ${targetDir})` : ` (will create ${targetDir})`;
      lines.push(
        this.scopePicker?.selectedScope === scope
          ? `${this.ctx.ui.theme.fg("muted", "→ ")}${this.ctx.ui.theme.fg("accent", scope)}${this.ctx.ui.theme.fg("muted", detail)}`
          : `  ${scope}${detail}`,
      );
    }
    lines.push("", this.ctx.ui.theme.fg("muted", "[↑↓] move  [enter] select  [esc] back"));
    return lines;
  }

  private renderMainEditor(): string[] {
    const draft = this.draft!;
    const innerWidth = Math.max(20, this.width - 2);
    const lines = [renderHeader("Edit role", this.width), ""];

    const fields: Array<[typeof draft.mainFocus, string, TextEditorState, number]> = [];
    if (draft.allowNameEdit) fields.push(["name", "Name", draft.nameEditor, 1]);
    fields.push(["description", "Description", draft.descriptionEditor, 2]);
    fields.push(["prompt", "Prompt", draft.promptEditor, MAIN_PROMPT_VIEWPORT]);

    for (const [field, label, editor, height] of fields) {
      const header = `${label}:`;
      lines.push(draft.mainFocus === field ? renderActiveCursorLabel(this.ctx.ui.theme, header) : `  ${header}`);
      const rendered = editorLines(editor, innerWidth, height);
      lines.push(...rendered);
      lines.push("");
    }

    if (draft.error) lines.push(draft.error, "");
    const footer = "[tab] switch  [ctrl+e] model  [ctrl+s] save  [esc] back"
    lines.push(this.ctx.ui.theme.fg("muted", footer));
    return lines;
  }

  private renderModelEditor(): string[] {
    const draft = this.draft!;
    const innerWidth = Math.max(20, this.width - 2);
    const lines = [renderHeader("Model & thinking", this.width), ""];
    const modelHeader = "Model:";
    const thinkingHeader = `Thinking: ${draft.thinking}`;

    lines.push(draft.modelFocus === "model" ? renderActiveCursorLabel(this.ctx.ui.theme, modelHeader) : `  ${modelHeader}`);
    lines.push(...editorLines(draft.modelEditor, innerWidth, 1));
    lines.push("");

    const filteredModels = filterModelOptions(this.modelOptions, draft.modelEditor.buffer);
    const visibleModels = getVisibleModelOptions(
      filteredModels,
      draft.modelCursor,
      MODEL_SUGGESTION_VIEWPORT,
    );
    if (visibleModels.length > 0) {
      lines.push("Suggestions:");
      const start = filteredModels.indexOf(visibleModels[0]!);
      visibleModels.forEach((model, index) => {
        const actualIndex = start + index;
        lines.push(
          draft.modelFocus === "model" && actualIndex === draft.modelCursor
            ? renderActiveCursorLabel(this.ctx.ui.theme, model.fullId)
            : `  ${model.fullId}`,
        );
      });
      lines.push("");
    }

    lines.push(this.ctx.ui.theme.fg("dim", DEFAULT_MODEL_HINT));
    lines.push(this.ctx.ui.theme.fg("dim", MANUAL_MODEL_HINT));
    const thinkingOptions = THINKING_LEVELS.map((level) => level === draft.thinking ? this.ctx.ui.theme.fg("accent", level) : level).join("  ");
    lines.push(`${draft.modelFocus === "thinking" ? renderActiveCursorLabel(this.ctx.ui.theme, "Thinking:") : "  Thinking:"} ${thinkingOptions}`);
    lines.push("");
    if (draft.error) lines.push(draft.error, "");
    const footer = "[tab] switch  [←→] move  [enter] select  [ctrl+e] prompt  [ctrl+s] save  [esc] back"
    lines.push(this.ctx.ui.theme.fg("muted", footer));
    return lines;
  }

  private renderDeleteConfirm(): string[] {
    const role = this.findRole(this.deleteRoleKey);
    return [
      renderHeader("Delete role", this.width),
      "",
      role ? `Delete ${role.name} (${role.source})?` : "Delete role?",
      "",
      "[y] delete  [n/esc] cancel",
    ];
  }

  handleInput(data: string): void {
    if (this.screen === "list") {
      const action = handleListInput(this.listState, this.entries, data);
      if (!action) return;
      if (action.type === "close") return this.done(undefined);
      if (action.type === "create") {
        this.detailRoleKey = null;
        return this.openScopePicker("create", "main");
      }
      return this.openDetail(action.roleKey);
    }

    if (this.screen === "detail") {
      const role = this.findRole(this.detailRoleKey);
      if (!role) {
        this.screen = "list";
        return;
      }
      if (matchesKey(data, "up")) {
        this.detailState.scrollOffset -= 1;
        return;
      }
      if (matchesKey(data, "down")) {
        this.detailState.scrollOffset += 1;
        return;
      }
      const action = handleDetailInput(role, data);
      if (!action) return;
      if (action.type === "back") {
        this.detailRoleKey = null;
        this.screen = "list";
        return;
      }
      if (action.type === "confirm-delete") {
        this.confirmDelete(this.detailRoleKey!);
        return;
      }
      if (action.type === "edit-main") {
        this.startEdit(role, "main");
        return;
      }
      if (action.type === "edit-model") {
        this.startEdit(role, "model");
        return;
      }
      if (action.type === "edit-shadowing-override") {
        const target = resolveEditTarget(this.roleSet.layered, role, role.shadowedBy);
        if (target) {
          this.startEdit(target.role, action.focus ?? "main", target.allowNameEdit);
          return;
        }
      }
      if (action.type === "create-override") {
        this.openScopePicker("override", "main", role);
      }
      return;
    }

    if (this.screen === "scope-picker") {
      if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
        const targetScreen = this.scopePicker?.mode === "create"
          ? resolveCreateCancelTarget(this.detailRoleKey)
          : this.detailRoleKey ? "detail" : "list";
        this.scopePicker = null;
        this.screen = targetScreen;
        return;
      }
      if ((matchesKey(data, "up") || matchesKey(data, "down") || matchesKey(data, "tab")) && this.roleSet.projectTargetDir) {
        if (!this.scopePicker) return;
        this.scopePicker.selectedScope = this.scopePicker.selectedScope === "user" ? "project" : "user";
        return;
      }
      if (!matchesKey(data, "return")) return;
      const picker = this.scopePicker!;
      this.scopePicker = null;
      if (picker.mode === "create") {
        this.startCreate(picker.selectedScope);
      } else if (picker.sourceRole) {
        this.startOverride(picker.sourceRole, picker.selectedScope, picker.focus);
      }
      return;
    }

    if (this.screen === "edit-main") {
      const draft = this.draft!;
      draft.error = undefined;
      if (matchesKey(data, "ctrl+s")) return this.saveDraft();
      if (matchesKey(data, "ctrl+e")) {
        this.screen = "edit-model";
        return;
      }
      if (matchesKey(data, "tab")) {
        const order = draft.allowNameEdit ? (["name", "description", "prompt"] as const) : (["description", "prompt"] as const);
        const currentIndex = order.indexOf(draft.mainFocus as any);
        draft.mainFocus = order[(currentIndex + 1) % order.length] as typeof draft.mainFocus;
        return;
      }
      if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
        const targetScreen = draft.existingRole ? (this.detailRoleKey ? "detail" : "list") : resolveCreateCancelTarget(this.detailRoleKey);
        this.screen = targetScreen;
        this.draft = null;
        return;
      }

      const editor = draft.mainFocus === "name"
        ? draft.nameEditor
        : draft.mainFocus === "description"
          ? draft.descriptionEditor
          : draft.promptEditor;
      const next = handleEditorInput(
        editor,
        data,
        Math.max(20, this.width - 2),
        draft.mainFocus === "prompt" ? { multiLine: true } : undefined,
      );
      if (!next) return;
      if (draft.mainFocus === "name") draft.nameEditor = next;
      else if (draft.mainFocus === "description") draft.descriptionEditor = next;
      else draft.promptEditor = next;
      return;
    }

    if (this.screen === "edit-model") {
      const draft = this.draft!;
      draft.error = undefined;
      if (matchesKey(data, "ctrl+s")) return this.saveDraft();
      if (matchesKey(data, "ctrl+e")) {
        this.screen = "edit-main";
        return;
      }
      if (matchesKey(data, "tab")) {
        draft.modelFocus = draft.modelFocus === "model" ? "thinking" : "model";
        return;
      }
      if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
        const targetScreen = draft.existingRole ? (this.detailRoleKey ? "detail" : "list") : resolveCreateCancelTarget(this.detailRoleKey);
        this.screen = targetScreen;
        this.draft = null;
        return;
      }
      if (draft.modelFocus === "thinking") {
        const currentIndex = THINKING_LEVELS.indexOf(draft.thinking);
        if (matchesKey(data, "left")) {
          draft.thinking = THINKING_LEVELS[(currentIndex - 1 + THINKING_LEVELS.length) % THINKING_LEVELS.length]!;
        } else if (matchesKey(data, "right")) {
          draft.thinking = THINKING_LEVELS[(currentIndex + 1) % THINKING_LEVELS.length]!;
        }
        return;
      }

      const filteredModels = filterModelOptions(this.modelOptions, draft.modelEditor.buffer);
      if (matchesKey(data, "up")) {
        draft.modelCursor = Math.max(0, draft.modelCursor - 1);
        return;
      }
      if (matchesKey(data, "down")) {
        draft.modelCursor = Math.min(Math.max(0, filteredModels.length - 1), draft.modelCursor + 1);
        return;
      }
      if (matchesKey(data, "return") && filteredModels.length > 0) {
        draft.modelEditor = createEditorState(filteredModels[draft.modelCursor]!.fullId);
        return;
      }
      const next = handleEditorInput(draft.modelEditor, data, Math.max(20, this.width - 2));
      if (next) draft.modelEditor = next;
      draft.modelCursor = 0;
      return;
    }

    if (this.screen === "confirm-delete") {
      if (data === "y" || data === "Y") {
        this.deleteCurrentRole();
        return;
      }
      if (data === "n" || data === "N" || matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
        this.deleteRoleKey = null;
        this.screen = "detail";
      }
    }
  }

  render(width: number): string[] {
    this.width = width;
    const rawLines = this.screen === "list"
      ? renderList(this.listState, this.entries, width, this.ctx.ui.theme, this.roleSet.warnings)
      : this.screen === "detail"
        ? (() => {
            const role = this.findRole(this.detailRoleKey);
            return role
              ? renderDetail(this.detailState, role, width, this.ctx.ui.theme)
              : renderList(this.listState, this.entries, width, this.ctx.ui.theme, this.roleSet.warnings);
          })()
        : this.screen === "scope-picker"
          ? this.renderScopePicker()
          : this.screen === "edit-main"
            ? this.renderMainEditor()
            : this.screen === "edit-model"
              ? this.renderModelEditor()
              : this.screen === "confirm-delete"
                ? this.renderDeleteConfirm()
                : [];
    return rawLines.map((line) => truncateToWidth(line, width));
  }

  invalidate(): void {}
  dispose(): void {}
}

export async function openSubagentsManager(ctx: ExtensionCommandContext): Promise<void> {
  const availableModels = typeof ctx.modelRegistry?.getAvailable === "function"
    ? await Promise.resolve(ctx.modelRegistry.getAvailable())
    : [];

  await ctx.ui.custom((_tui, _theme, _kb, done) => new SubagentsManagerComponent(ctx, availableModels ?? [], done));
}
