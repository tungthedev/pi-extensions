import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { installCodexEditorUi } from "./install.ts";

export {
  getDollarSkillPrefix,
  normalizeCodexEditorInput,
  shouldTriggerDollarSkillAutocomplete,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./autocomplete-dollar-skill.ts";
export { createSubagentRoleAutocompleteProvider } from "./autocomplete-subagent-roles.ts";
export {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "./events.ts";
export {
  formatEditorBorderLegend,
  formatLeftStatus,
  formatRightStatus,
  formatTopBorderLine,
} from "./status-format.ts";
export { installCodexEditorUi } from "./install.ts";

export default function editor(pi: ExtensionAPI): void {
  installCodexEditorUi(pi);
}
