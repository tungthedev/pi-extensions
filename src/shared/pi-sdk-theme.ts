const EAR_WORKS_THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

export function syncEarendilWorksTheme(theme: unknown): void {
  // Pi versions before/around the package-scope migration can load extensions from
  // a different SDK package instance than the interactive runtime. Some native SDK
  // render helpers ignore their theme argument and read their package-level theme
  // singleton, so bridge the runtime-provided theme into this package's singleton
  // before delegating. Without this, Pi silently falls back to generic rendering.
  if (theme && typeof theme === "object") {
    (globalThis as Record<symbol, unknown>)[EAR_WORKS_THEME_KEY] = theme;
  }
}
