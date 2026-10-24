import type { ComponentType, ReactNode } from "react";

/**
 * The slot contract — genesis's escape hatch from an all-or-nothing pattern.
 *
 * A pattern component (`ResourcePage`, `DataPageShell`, …) is a composition of
 * interior parts. Without a way to reach those parts, a consumer who needs ONE
 * of them to differ has exactly two options: accept the whole thing as shipped,
 * or fork it. Both are bad, and the second is what actually happens — which is
 * how a downstream app ends up maintaining its own copy of a header it only
 * wanted to change one button in.
 *
 * Genesis offers a customisation ladder, and this is its missing rung:
 *
 *   1. the pattern         `<ResourcePage title="Questions" />`
 *   2. the pattern + slots  ← here: keep the wiring, swap or drop one part
 *   3. the primitives      `<DataPageShell><DataTable/></DataPageShell>`
 *   4. the hook            `useResourcePage()`, render it all yourself
 *
 * Rungs 1, 3 and 4 already existed (75 subpath exports, 9 hooks). Rung 2 is
 * the one that keeps a consumer ON the ladder: dropping to rung 3 because a
 * single part was wrong means re-deriving all the wiring that was already
 * right, and that re-derivation is where the forks come from.
 *
 * Two knobs, following the `slots`/`slotProps` convention Material UI settled
 * on (mui/material-ui#33416) so the shape is one a React developer already
 * knows rather than one genesis invented:
 *
 *   `slots`     — REPLACE a part. Your component receives exactly the props
 *                 genesis would have passed the default, so it can wrap the
 *                 default and change one thing rather than reimplement it.
 *   `slotProps` — KEEP the part, pass it more props. The common case: a
 *                 `className`, a `data-testid`, an `aria-label`.
 *
 * And the eject button: `slots={{ bulkBar: null }}` drops that part entirely.
 * A pattern is a default, not a mandate — a consumer who wants the shell and
 * the grid but none of the bulk bar should not have to leave to get that.
 */

/** Replace a part (`ComponentType`), or eject it (`null`). */
export type SlotOverride<P> = ComponentType<P> | null;

/** `{ [part]: Component | null }` — see {@link renderSlot}. */
export type Slots<M extends Record<string, object>> = {
  [K in keyof M]?: SlotOverride<M[K]>;
};

/** `{ [part]: extraProps }` — merged over what genesis passes. */
export type SlotPropsFor<M extends Record<string, object>> = {
  [K in keyof M]?: Partial<M[K]>;
};

/**
 * Renders one slot: the override if given, the default otherwise, nothing if
 * ejected with `null`.
 *
 * `extra` merges LAST, so `slotProps` wins over genesis's own value. That is
 * deliberate: a consumer reaching for `slotProps` is overriding on purpose,
 * and a hatch that silently loses to the default is not a hatch. `className`
 * is the one prop a caller should merge with `cn()` instead of replacing.
 */
export function renderSlot<P extends object>(
  Default: ComponentType<P>,
  override: SlotOverride<P> | undefined,
  props: P,
  extra?: Partial<P>,
): ReactNode {
  if (override === null) return null;
  const Component = override ?? Default;
  return <Component {...props} {...(extra as P)} />;
}
