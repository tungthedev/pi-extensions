import type { AutocompleteProvider } from "@mariozechner/pi-tui";

export type AutocompleteProviderWrapper = (provider: AutocompleteProvider) => AutocompleteProvider;

export function composeAutocompleteProvider(
  provider: AutocompleteProvider,
  wrappers: readonly AutocompleteProviderWrapper[],
): AutocompleteProvider {
  return wrappers.reduce((current, wrap) => wrap(current), provider);
}
