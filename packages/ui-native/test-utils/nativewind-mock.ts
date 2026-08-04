// nativewind shim for vitest — we don't exercise styling in unit tests.
export function cssInterop(component: unknown): unknown {
  return component;
}
