// nativewind shim for vitest — we don't exercise styling in unit tests.
export function cssInterop(component: unknown): unknown {
  return component;
}

/** NativeWind's `vars()` as a plain style object of the variables, so tests can read them back. */
export function vars(variables: Record<string, string | number>): Record<string, string | number> {
  const style: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(variables)) style[name.startsWith("--") ? name : `--${name}`] = value;
  return style;
}
