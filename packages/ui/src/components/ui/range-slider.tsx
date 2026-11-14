"use client";

import * as React from "react";
import { clampRange } from "@marktiderman/genesis-core/headless";
import { Slider } from "./slider";

export interface RangeSliderProps {
  /** The low and high ends. */
  value: [number, number];
  onChange: (value: [number, number]) => void;
  /** Called once a drag ends, with the final range. */
  onCommit?: ((value: [number, number]) => void) | undefined;
  min?: number;
  max?: number;
  step?: number;
  /** Steps the two thumbs keep between them. Default 0 (they may meet). */
  minStepsBetweenThumbs?: number;
  /** The thumbs' accessible names. Default "Minimum" and "Maximum". */
  labels?: readonly [string, string];
  disabled?: boolean;
  className?: string;
  testID?: string;
}

/**
 * RangeSlider — two thumbs on one track, for a range (a price band, an age range): the twin of
 * genesis-ui-native's NativeRangeSlider, with the same `value: [low, high]` and `onChange`.
 *
 * It is the Slider with two values (Radix draws a thumb per value, each keyboard-adjustable with
 * the arrow keys, Page Up/Down and Home/End). The ends are snapped and kept in order by
 * genesis-core's `clampRange`, the rule the phone's twin applies.
 *
 * @stability Beta
 */
export function RangeSlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  minStepsBetweenThumbs = 0,
  labels = ["Minimum", "Maximum"],
  disabled,
  className,
  testID,
}: RangeSliderProps) {
  const fit = (next: number[]) => clampRange([next[0] ?? min, next[1] ?? max], { min, max, step });
  return (
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      minStepsBetweenThumbs={minStepsBetweenThumbs}
      disabled={disabled}
      thumbLabels={labels}
      onValueChange={(next) => onChange(fit(next))}
      {...(onCommit ? { onValueCommit: (next: number[]) => onCommit(fit(next)) } : {})}
      className={className}
      data-testid={testID}
    />
  );
}
