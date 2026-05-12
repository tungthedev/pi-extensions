import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installCodexEditorUi } from "./install.js";

export {
  getDollarSkillPrefix,
  normalizeCodexEditorInput,
  shouldTriggerDollarSkillAutocomplete,
  wrapAutocompleteProviderWithDollarSkillSupport,
} from "./autocomplete-dollar-skill.js";
export { createSubagentRoleAutocompleteProvider } from "./autocomplete-subagent-roles.js";
export {
  EDITOR_REMOVE_STATUS_SEGMENT_EVENT,
  EDITOR_SET_STATUS_SEGMENT_EVENT,
} from "./events.js";
export {
  formatEditorBorderLegend,
  formatLeftStatus,
  formatRightStatus,
  formatTopBorderLine,
} from "./status-format.js";
export { installCodexEditorUi } from "./install.js";

export default function editor(pi: ExtensionAPI): void {
  installCodexEditorUi(pi);
}
