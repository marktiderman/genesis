"use client";

import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "../../utils";

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * Each thumb's accessible name, in order ("Minimum price", "Maximum price"). A thumb is drawn
   * per value, so `value={[20, 80]}` is a range (RangeSlider names its two).
   */
  thumbLabels?: readonly string[] | undefined;
}

const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, thumbLabels, ...props }, ref) => {
  const thumbs = Math.max(1, (props.value ?? props.defaultValue ?? [props.min ?? 0]).length);
  return (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {Array.from({ length: thumbs }, (_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        aria-label={thumbLabels?.[i]}
        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      />
    ))}
  </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
