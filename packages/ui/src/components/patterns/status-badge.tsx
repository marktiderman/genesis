import * as React from "react";
import { type VariantProps, cva } from "class-variance-authority";
import type { status } from "@marktiderman/genesis-design-system/tokens";
import { cn } from "../../utils";

/**
 * The domain status vocabulary `StatusBadge` understands. A `Pick` (not a
 * hand-copied literal union) of `@marktiderman/genesis-design-system`'s
 * `status` tokens, so removing/renaming one of these keys upstream breaks
 * this file's typecheck instead of silently drifting.
 */
type StatusBadgeStatus = keyof Pick<
  typeof status,
  "onTrack" | "atRisk" | "offTrack" | "done" | "blocked" | "inProgress"
>;

export const statusBadgeVariants = cva(
  "inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      // AA-safe status text on the tinted chip, same technique as `Badge`'s
      // success/warning/info variants (see badge.tsx): same-hue text on the
      // raw tint fails WCAG AA, so text uses the semantic Tailwind ramp
      // (same hues as the Genesis status tokens). All four hues clear 4.5:1
      // at the 700(light)/300(dark) stops over the /15(light) and /20(dark)
      // tints (emerald-700 4.76:1, blue-700 5.64:1, red-700 ~5.3:1);
      // warning needs the 800/200 bump (amber-700 was 4.48:1 — under the
      // 4.5:1 floor).
      //
      // NOTE on `destructive` vs `error`: the offTrack/blocked tint is
      // `bg-destructive`, NOT `bg-error`, even though these two map to the
      // `semantic.error` token upstream. The token layer names this
      // semantic `error`; the CSS theme layer (apps' `@theme` blocks,
      // design-system's generated genesis.css) names the very same color
      // `destructive` and registers no `--color-error` at all — so
      // `bg-error` would silently emit no utility and render an untinted
      // chip. In light mode the two are literally the same value
      // (`--destructive` = 0 84.2% 60.2% = #EF4444 = semantic.error.DEFAULT).
      // Dark mode is the one asymmetry: the theme darkens `--destructive`
      // (0 62.8% 30.6%) while keeping success/warning/info bright, so these
      // two chips read as a more subdued tint there. Left as-is rather than
      // hand-tuning a red-only opacity — that is a theme-layer
      // characteristic, not this component's to paper over.
      //
      // TOKEN GAP — do NOT "fix" the text colours below to `text-*-foreground`
      // (CMT-365-001 proposed exactly that). Those tokens pair with a SOLID
      // fill: `--success-foreground` is `0 0% 100%` (pure white) and
      // `--destructive-foreground` is `0 0% 98%`. These chips use a 15%/20%
      // TINT, so white text on them measures roughly 1.2:1 — unreadable. That
      // review was right about the defect and wrong about the remedy.
      //
      // The correct fix needs a token that does not exist yet: an "on-tint"
      // foreground per status. The scales already carry the right value —
      // `success.dark` is #065F46, which is what `emerald-700` approximates —
      // but no `--color-success-dark` utility is emitted, so it cannot be
      // referenced from here today. Adding one is a design-system API
      // decision, so it is recorded rather than smuggled in.
      //
      // Until then this is a KNOWN brand-theming gap, stated plainly: a
      // consumer brand that redefines `success` gets the new background and
      // the old text colour.
      status: {
        onTrack:
          "border-transparent bg-success/15 text-emerald-700 dark:bg-success/20 dark:text-emerald-300",
        done: "border-transparent bg-success/15 text-emerald-700 dark:bg-success/20 dark:text-emerald-300",
        atRisk:
          "border-transparent bg-warning/15 text-amber-800 dark:bg-warning/20 dark:text-amber-200",
        inProgress:
          "border-transparent bg-info/15 text-blue-700 dark:bg-info/20 dark:text-blue-300",
        offTrack:
          "border-transparent bg-destructive/15 text-red-700 dark:bg-destructive/20 dark:text-red-300",
        blocked:
          "border-transparent bg-destructive/15 text-red-700 dark:bg-destructive/20 dark:text-red-300",
      } satisfies Record<StatusBadgeStatus, string>,
    },
  }
);

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  /** Which status to render. Drives the tint via `statusBadgeVariants`. */
  status: StatusBadgeStatus;
}

/**
 * Status-specific badge for progress/health states — the EOS/OKR-style
 * "on track / at risk / off track" goal vocabulary plus common
 * task-lifecycle states ("done", "blocked", "in progress").
 *
 * `Badge` answers "what color is this badge"; `StatusBadge` answers "what
 * does this business status look like as a badge" — it owns the
 * status → semantic-token mapping so consumers pass a status name instead
 * of hand-rolling their own `status-to-color` lookup (the pattern this
 * component exists to retire). Colors are token-driven — the same
 * `bg-success` / `bg-warning` / `bg-destructive` / `bg-info` semantic
 * Tailwind families `Badge` already uses, backed by
 * `@marktiderman/genesis-design-system`'s `status` tokens — no raw hex here.
 *
 * @stability Beta
 */
export function StatusBadge({ className, status, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(statusBadgeVariants({ status }), className)}
      {...props}
    />
  );
}

export type { StatusBadgeStatus };
