/**
 * Layout spacing scale — the single source of truth for gap / padding /
 * margin across the Genesis layout primitives (Stack / Inline / Box / Grid).
 *
 * Semantic step names map to pixel values on the 4px Tailwind grid. The
 * primitives NEVER inline a px value or hand-write a `gap-N` / `p-N` class —
 * they always resolve through `spacingClass()` so spacing stays token-driven
 * (the Braid rule the PRD-46 research flags: "layout primitives own all
 * spacing"). When the design-system semantic spacing tier lands, this scale
 * re-points to it additively — consumers keep the same `SpaceToken` API.
 */
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

export type SpaceToken = keyof typeof spaceScale;

/** One Tailwind spacing unit === 4px (the design grid). */
const TAILWIND_UNIT_PX = 4;

/** Spacing-bearing NativeWind utility prefixes the primitives emit. */
export type SpacingPrefix =
  | "gap"
  | "p"
  | "px"
  | "py"
  | "pt"
  | "pb"
  | "pl"
  | "pr"
  | "m"
  | "mx"
  | "my"
  | "mt"
  | "mb"
  | "ml"
  | "mr";

/**
 * The class strings MUST be static literals, not built at runtime.
 * NativeWind/Tailwind compiles only the literal class names its content
 * scanner finds in source — it never executes `spacingClass()`. A
 * template-literal form (`${prefix}-${spaceScale[token] / 4}`) is invisible
 * to the scanner, so any utility that doesn't independently appear as a
 * literal elsewhere is a SILENT NO-OP at runtime (spacing simply doesn't
 * apply). Verified empirically: with the runtime form, `gap-6` (xl),
 * `gap-8` (2xl), and `gap-12` (3xl) were ABSENT from the compiled output,
 * so `<Stack gap="xl">` rendered with no gap.
 *
 * This lookup keeps every emittable class as a scannable literal in the
 * genesis source (which each consuming app already includes in its Tailwind
 * `content` globs), so the full token range compiles. It is the substrate-
 * correct fix — a per-app safelist would have to be duplicated in every
 * consumer's Tailwind config. The map MUST stay in sync with `spaceScale`;
 * the layout-primitives test asserts the round-trip.
 */
const SPACING_CLASSES: Record<SpacingPrefix, Record<SpaceToken, string>> = {
  gap: { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4", xl: "gap-6", "2xl": "gap-8", "3xl": "gap-12" },
  p: { none: "p-0", xs: "p-1", sm: "p-2", md: "p-3", lg: "p-4", xl: "p-6", "2xl": "p-8", "3xl": "p-12" },
  px: { none: "px-0", xs: "px-1", sm: "px-2", md: "px-3", lg: "px-4", xl: "px-6", "2xl": "px-8", "3xl": "px-12" },
  py: { none: "py-0", xs: "py-1", sm: "py-2", md: "py-3", lg: "py-4", xl: "py-6", "2xl": "py-8", "3xl": "py-12" },
  pt: { none: "pt-0", xs: "pt-1", sm: "pt-2", md: "pt-3", lg: "pt-4", xl: "pt-6", "2xl": "pt-8", "3xl": "pt-12" },
  pb: { none: "pb-0", xs: "pb-1", sm: "pb-2", md: "pb-3", lg: "pb-4", xl: "pb-6", "2xl": "pb-8", "3xl": "pb-12" },
  pl: { none: "pl-0", xs: "pl-1", sm: "pl-2", md: "pl-3", lg: "pl-4", xl: "pl-6", "2xl": "pl-8", "3xl": "pl-12" },
  pr: { none: "pr-0", xs: "pr-1", sm: "pr-2", md: "pr-3", lg: "pr-4", xl: "pr-6", "2xl": "pr-8", "3xl": "pr-12" },
  m: { none: "m-0", xs: "m-1", sm: "m-2", md: "m-3", lg: "m-4", xl: "m-6", "2xl": "m-8", "3xl": "m-12" },
  mx: { none: "mx-0", xs: "mx-1", sm: "mx-2", md: "mx-3", lg: "mx-4", xl: "mx-6", "2xl": "mx-8", "3xl": "mx-12" },
  my: { none: "my-0", xs: "my-1", sm: "my-2", md: "my-3", lg: "my-4", xl: "my-6", "2xl": "my-8", "3xl": "my-12" },
  mt: { none: "mt-0", xs: "mt-1", sm: "mt-2", md: "mt-3", lg: "mt-4", xl: "mt-6", "2xl": "mt-8", "3xl": "mt-12" },
  mb: { none: "mb-0", xs: "mb-1", sm: "mb-2", md: "mb-3", lg: "mb-4", xl: "mb-6", "2xl": "mb-8", "3xl": "mb-12" },
  ml: { none: "ml-0", xs: "ml-1", sm: "ml-2", md: "ml-3", lg: "ml-4", xl: "ml-6", "2xl": "ml-8", "3xl": "ml-12" },
  mr: { none: "mr-0", xs: "mr-1", sm: "mr-2", md: "mr-3", lg: "mr-4", xl: "mr-6", "2xl": "mr-8", "3xl": "mr-12" },
};

// `process` is declared locally because this package compiles against minimal
// RN stubs (no @types/node in `types`), so the ambient global isn't otherwise
// in scope. We guard the drift check on the LITERAL `process.env.NODE_ENV`
// expression on purpose: Metro/Babel's env inliner matches only that exact
// member path (not a `globalThis.process?.env?.NODE_ENV` lookup), so it's
// substituted at build time and the block below is dead-code-eliminated from
// RN production bundles instead of running on every render. In Node/Vitest
// `process.env.NODE_ENV` is defined, so the invariant still runs in dev/test.
declare const process: { env: { NODE_ENV?: string } };

/**
 * Resolve a semantic spacing token to its NativeWind utility class for a
 * given prefix — e.g. `spacingClass("gap", "md") === "gap-3"` (12px / 4).
 *
 * Returns a STATIC literal from `SPACING_CLASSES` (see the note there) so the
 * Tailwind content scanner can compile it. The dev-only invariant check keeps
 * the literal honest against `spaceScale` — if the map ever drifts from the
 * token scale it throws in dev rather than silently shipping the wrong gap.
 */
export function spacingClass(prefix: SpacingPrefix, token: SpaceToken): string {
  const cls = SPACING_CLASSES[prefix][token];
  // Literal `process.env.NODE_ENV` so Metro/Babel inlines it and strips this
  // block from RN production bundles — keeping this hot render path minimal.
  // It only throws on genuine map/scale drift, which never happens for the
  // in-sync table.
  if (process.env.NODE_ENV !== "production") {
    const expected = `${prefix}-${spaceScale[token] / TAILWIND_UNIT_PX}`;
    if (cls !== expected) {
      throw new Error(
        `spacingClass map drift: ${prefix}/${token} → "${cls}" but spaceScale implies "${expected}". Update SPACING_CLASSES.`,
      );
    }
  }
  return cls;
}
