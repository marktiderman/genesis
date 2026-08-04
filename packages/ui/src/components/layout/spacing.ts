/**
 * Layout spacing scale — the single source of truth for the `gap` prop
 * shared by `Stack`, `Grid` and `Split`.
 *
 * These are the SAME semantic step names and the SAME pixel values as
 * `@marktiderman/genesis-ui-native`'s `spaceScale`
 * (`packages/ui-native/src/components/layout/spacing.ts`), which already
 * governs the native `Stack` / `Inline` / `Box` / `Grid`. That parity is the
 * point: `gap="lg"` has to mean 16px on both surfaces, or a design spec
 * written once produces two different pages. A second, subtly-different
 * six-step scale on web would have been exactly the "one concept, two
 * divergent implementations" failure `docs/FRAMEWORK.md` is written to
 * prevent.
 *
 * Every emitted class is a STATIC literal in `GAP_CLASSES` rather than a
 * template built at runtime, for the same reason the native side spells its
 * table out: Tailwind compiles only the class names its content scanner
 * finds in source. A `gap-${scale[token] / 4}` form is invisible to the
 * scanner, so any step that doesn't independently appear as a literal
 * elsewhere silently renders with no gap at all.
 *
 * @stability Beta
 */

/** Semantic spacing steps, in pixels, on the 4px design grid. */
export const spaceScale = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

/**
 * The spacing vocabulary shared by every layout primitive — and, by
 * construction, by the native ones too.
 */
export type SpaceToken = keyof typeof spaceScale;

/**
 * `SpaceToken` → Tailwind gap utility. `satisfies` keeps the table
 * exhaustive against the scale, so adding a step to `spaceScale` without a
 * class here is a type error rather than a silently missing gap.
 */
export const GAP_CLASSES = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
  xl: "gap-6",
  "2xl": "gap-8",
  "3xl": "gap-12",
} as const satisfies Record<SpaceToken, string>;
