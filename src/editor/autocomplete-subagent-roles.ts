import type { AutocompleteItem, AutocompleteProvider } from "@mariozechner/pi-tui";

type SubagentRoleAutocompleteOptions = {
  cwd: string;
  resolveRoleNames: (options: { cwd: string }) => string[];
};

const AGENT_TYPE_VALUE_PATTERNS = [
  /(?:^|[\s,{])"(?:agent_type|subagent_type)"\s*:\s*"([^"\n]*)$/,
  /(?:^|[\s,{])(?:agent_type|subagent_type)\s*:\s*([A-Za-z0-9_-]*)$/,
];

function extractAgentTypePrefix(textBeforeCursor: string): string | null {
  for (const pattern of AGENT_TYPE_VALUE_PATTERNS) {
    const match = textBeforeCursor.match(pattern);
    if (match) {
      return match[1] ?? "";
    }
  }
  return null;
}

function buildItems(roleNames: string[], query: string): AutocompleteItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  return roleNames
    .filter((name) =>
      normalizedQuery.length === 0 ? true : name.toLowerCase().includes(normalizedQuery),
    )
    .map((name) => ({ value: name, label: name }));
}

export function createSubagentRoleAutocompleteProvider(options: SubagentRoleAutocompleteOptions) {
  return (provider: AutocompleteProvider): AutocompleteProvider => ({
    async getSuggestions(lines, cursorLine, cursorCol, autocompleteOptions) {
      const currentLine = lines[cursorLine] ?? "";
      const textBeforeCursor = currentLine.slice(0, cursorCol);
      const prefix = extractAgentTypePrefix(textBeforeCursor);
      if (prefix === null) {
        return await provider.getSuggestions(lines, cursorLine, cursorCol, autocompleteOptions);
      }

      const items = buildItems(options.resolveRoleNames({ cwd: options.cwd }), prefix);
      if (items.length === 0) {
        return await provider.getSuggestions(lines, cursorLine, cursorCol, autocompleteOptions);
      }

      return {
        prefix,
        items,
      };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return provider.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
  });
}
