/**
 * GENESIS_THEME_V2 feature flag — PRD-07 A2b dual-mode window.
 *
 * The unified theme provider ships behind this flag during the
 * dual-mode window so v0.2.x consumers are unaffected by default.
 * Once visual parity is confirmed, the flag is removed in the
 * final commit of A2b (or deferred to G-PR-3b).
 *
 * Reading semantics:
 *
 * - **Web (Vite / React Router 7):** `import.meta.env.GENESIS_THEME_V2`.
 *   Vite exposes env vars prefixed with `VITE_` by default; consumers
 *   should set `VITE_GENESIS_THEME_V2=true` and Vite users will read it
 *   as `import.meta.env.VITE_GENESIS_THEME_V2`. We accept both forms.
 *
 * - **Native (Expo / Metro):** `process.env.GENESIS_THEME_V2` — Metro
 *   inlines `process.env.*` at bundle time when set in `.env` or
 *   `eas.json`'s build profile env.
 *
 * Both readers are best-effort: they MUST NOT throw at import time on
 * platforms where one or the other API is unavailable. Default OFF.
 */

/**
 * Truthy flag values accepted from env. We standardize on the strings
 * `"true"` and `"1"` (case-insensitive); anything else (including
 * undefined) is OFF.
 */
function isTruthyEnv(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Read the GENESIS_THEME_V2 flag in a platform-agnostic way.
 *
 * Returns `true` iff any of these env sources is truthy:
 *   - `process.env.GENESIS_THEME_V2`
 *   - `process.env.VITE_GENESIS_THEME_V2`
 *   - `import.meta.env.GENESIS_THEME_V2` (web build only)
 *   - `import.meta.env.VITE_GENESIS_THEME_V2` (web build only)
 *
 * Safe to call at module scope on either platform.
 */
export function readGenesisThemeV2Flag(): boolean {
  // process.env path — works on Node, Metro, and most Vite builds (Vite
  // also exposes process.env.* for compat with some libs).
  if (typeof process !== "undefined" && process.env) {
    if (isTruthyEnv(process.env.GENESIS_THEME_V2)) return true;
    if (isTruthyEnv(process.env.VITE_GENESIS_THEME_V2)) return true;
  }

  // import.meta.env path — Vite-specific. Wrapped in try/catch because
  // tooling that pre-evaluates this module without ES2020 import.meta
  // support (older Jest configs) can throw.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (globalThis as any)?.["import"]?.["meta"]?.env;
    if (meta) {
      if (isTruthyEnv(meta.GENESIS_THEME_V2)) return true;
      if (isTruthyEnv(meta.VITE_GENESIS_THEME_V2)) return true;
    }
  } catch {
    // ignore — env-source optional
  }

  return false;
}

/**
 * Resolved flag value at module-load time. Most consumer code should
 * read this instead of calling {@link readGenesisThemeV2Flag} repeatedly.
 *
 * Note: this is computed at module load. Tests that need to flip the
 * flag should call `readGenesisThemeV2Flag()` directly inside the
 * test, not check this constant.
 */
export const GENESIS_THEME_V2 = readGenesisThemeV2Flag();
