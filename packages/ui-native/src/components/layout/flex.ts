/**
 * Shared flexbox alignment vocabulary for the row/column layout primitives
 * (Stack / Inline). Kept as a tiny token map so Stack and Inline express the
 * SAME `align` / `justify` props with one source of truth — variant props,
 * not 30-prop configuration.
 */

export type FlexAlign = "start" | "center" | "end" | "stretch";
export type FlexJustify = "start" | "center" | "end" | "between" | "around";

export const alignClasses: Record<FlexAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export const justifyClasses: Record<FlexJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
};
