/**
 * Generic localStorage-backed persistence for "customize chrome" option
 * objects (AppShell, PageHeader, …). SSR-safe (no-ops without `window`) and
 * swallows quota / private-mode errors so a storage failure never breaks
 * rendering.
 *
 * Callers own their own shape validation — this module only handles the
 * JSON <-> localStorage plumbing shared across chrome components.
 */
export function readStoredOptions<T extends object>(key: string): Partial<T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<T>;
  } catch {
    return {};
  }
}

export function writeStoredOptions<T extends object>(
  key: string,
  value: Partial<T>,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode
  }
}
