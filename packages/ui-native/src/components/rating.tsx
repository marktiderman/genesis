/**
 * NativeRating — a row of stars showing a score out of `max`, read-only or
 * tappable.
 *
 * Without `onChange` (or with `readOnly`) it is one image for screen readers
 * ("3 of 5 stars"). With it, each star is a radio in a radiogroup, so
 * VoiceOver and TalkBack read the chosen one and the rest as options;
 * pressing the current value clears the rating (`nextRating`). Filled stars
 * draw in the `warning` role (what `text-warning` resolves to), empty ones in
 * the muted foreground. Same props as the web `Rating`.
 *
 * @stability Beta
 */
import { Platform, Pressable, View } from "react-native";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { cn } from "../utils";
import { useGenesisModules } from "../native-modules";
import { NativeIcon } from "./icon";

export type NativeRatingSize = "sm" | "md" | "lg";

export interface NativeRatingProps {
  /** The score, 0..`max`. Fractions round to the nearest star. */
  value: number;
  /** Number of stars. Default 5. */
  max?: number;
  /** Makes the stars tappable; absent, the rating is read-only. */
  onChange?: (value: number) => void;
  /** Read-only even with `onChange`. */
  readOnly?: boolean;
  /** Default "md". */
  size?: NativeRatingSize;
  /** The control's accessible name ("Service rating"): read-only reads "Service rating: 3 of 5 stars". */
  label?: string;
  /** The accessibility text for a value, in place of "N of M stars" (read-only label, each radio's label and value). */
  getLabel?: (value: number, max: number) => string;
  className?: string;
  testID?: string;
}

const STAR_SIZE: Record<NativeRatingSize, number> = { sm: 14, md: 20, lg: 28 };

/** The value after pressing `star`: that star, or 0 when it is the current value (a press clears). */
export function nextRating(value: number, star: number): number {
  return star === value ? 0 : star;
}

/**
 * One star. On iOS the SF Symbol differs by weight; on the lucide fallback the
 * filled star is solid (`fill`) and the empty one an outline, so the state
 * never rests on colour alone.
 */
function Star({ on, size, testID }: { on: boolean; size: number; testID?: string }) {
  const roles = useThemeRoles();
  const { symbol, icons } = useGenesisModules();
  const color = on ? roles.warning : roles.secondaryLabel;
  const Lucide = icons?.star;
  if (!(Platform.OS === "ios" && symbol) && Lucide) {
    return (
      <Lucide size={size} color={color} fill={on ? roles.warning : "none"} strokeWidth={on ? 2 : 1.5} testID={testID} />
    );
  }
  return <NativeIcon name="star" size={size} weight={on ? "bold" : "regular"} color={color} testID={testID} />;
}

export function NativeRating({
  value,
  max = 5,
  onChange,
  readOnly = false,
  size = "md",
  label,
  getLabel,
  className,
  testID = "native-rating",
}: NativeRatingProps) {
  const count = Math.max(1, Math.floor(max));
  const filled = Math.min(count, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  const px = STAR_SIZE[size];
  const starsText = (n: number) => (getLabel ? getLabel(n, count) : `${n} of ${count} stars`);
  const summary = label ? `${label}: ${starsText(filled)}` : starsText(filled);
  const stars = Array.from({ length: count }, (_, i) => i + 1);
  const interactive = Boolean(onChange) && !readOnly;

  if (!interactive) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        className={cn("flex-row items-center gap-0.5", className)}
      >
        {stars.map((n) => (
          <Star key={n} on={n <= filled} size={px} testID={`${testID}-star-${n}`} />
        ))}
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label ?? "Rating"}
      accessibilityValue={{ min: 0, max: count, now: filled, text: summary }}
      className={cn("flex-row items-center gap-0.5", className)}
    >
      {stars.map((n) => {
        const selected = n === filled;
        return (
          <Pressable
            key={n}
            testID={`${testID}-star-${n}`}
            accessibilityRole="radio"
            accessibilityLabel={starsText(n)}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange?.(nextRating(filled, n))}
            hitSlop={4}
            className="p-0.5"
          >
            <Star on={n <= filled} size={px} />
          </Pressable>
        );
      })}
    </View>
  );
}
