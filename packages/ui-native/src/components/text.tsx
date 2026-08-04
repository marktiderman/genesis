/**
 * Text — typography primitive with semantic presets (h1, h2, body, caption, etc.).
 *
 * @stability Stable
 */
import { type VariantProps, cva } from "class-variance-authority";
import { Text as RNText, type TextProps } from "react-native";
import { cn } from "../utils";

const textVariants = cva("text-foreground", {
  variants: {
    preset: {
      h1: "text-3xl font-bold leading-9",
      h2: "text-2xl font-bold leading-8",
      h3: "text-xl font-semibold leading-7",
      h4: "text-lg font-semibold leading-7",
      body: "text-base font-normal leading-6",
      "body-sm": "text-sm font-normal leading-5",
      caption: "text-xs font-normal leading-4",
      label: "text-sm font-medium leading-5",
    },
  },
  defaultVariants: {
    preset: "body",
  },
});

// `className` is declared explicitly here — not inherited from react-native's
// `TextProps` via NativeWind's global augmentation, which does not resolve across
// the RN / nativewind / react-native-css-interop version matrix. Mirrors every
// other ui-native primitive (Button, Tooltip, ChipGroup, …); the implementation
// already consumes `className` below.
export interface NativeTextProps
  extends TextProps,
    VariantProps<typeof textVariants> {
  /** NativeWind utility class string applied to the underlying Text. */
  className?: string;
}

/**
 * Allowed `preset` values on {@link NativeText}. Re-exported as a named type
 * so consumer brand packages can build preset-driven typography APIs without
 * having to reach into `NativeTextProps['preset']` themselves.
 *
 * Example (consumer):
 * ```ts
 * import type { TextPreset } from "@marktiderman/genesis-ui-native";
 * function Heading({ as }: { as: TextPreset }) { ... }
 * ```
 */
export type TextPreset = NonNullable<NativeTextProps["preset"]>;

function NativeText({
  className,
  preset,
  children,
  ...props
}: NativeTextProps) {
  return (
    <RNText
      className={cn(textVariants({ preset }), className)}
      {...props}
    >
      {children}
    </RNText>
  );
}

export { NativeText, textVariants };
