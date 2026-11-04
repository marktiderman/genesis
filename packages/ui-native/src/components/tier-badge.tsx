/**
 * NativeTierBadge — a rank or tier label ("Gold", "Level 3"), with an optional
 * leading icon and a tone from the brand's `accents`.
 *
 * `tone` names a brand accent, read from the nearest `GenesisThemeProvider`
 * (`theme.tokens.accents`): the accent is the border and a 15% tint behind
 * the text, and the text stays the foreground colour, so it reads at AA
 * whatever the accent. Without a tone, a provider or such an accent, it is
 * the secondary chip.
 *
 * @stability Beta
 */
import { Text, View } from "react-native";
import { useOptionalTheme } from "@marktiderman/genesis-design-system";
import { cn } from "../utils";
import type { NativeIconName } from "../icon-names";
import { NativeIcon } from "./icon";

export interface NativeTierBadgeProps {
  /** The rank or tier, as shown ("Gold"). */
  label: string;
  /** A key of the brand's `accents` (`"gold"`). Unset: neutral. */
  tone?: string;
  /** Leading icon, by Genesis icon name. */
  icon?: NativeIconName;
  /** `sm` for a list row, `md` (default) for a header. */
  size?: "sm" | "md";
  className?: string;
  textClassName?: string;
  /** What a screen reader says. Default: the label. */
  accessibilityLabel?: string;
  testID?: string;
}

/** `#rrggbb` + alpha (0–1) → `#rrggbbaa`; anything else is returned as is. */
function withAlpha(colour: string, alpha: number): string {
  const full = /^#([0-9a-f]{3})$/i.test(colour) ? `#${[...colour.slice(1)].map((c) => c + c).join("")}` : colour;
  // A colour that can't take an alpha here (rgb(), hsl(), a name) gets no tint, so the text stays readable.
  if (!/^#[0-9a-f]{6}$/i.test(full)) return "transparent";
  return `${full}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

function NativeTierBadge({ label, tone, icon, size = "md", className, textClassName, accessibilityLabel, testID }: NativeTierBadgeProps) {
  const accents = useOptionalTheme()?.tokens.accents;
  const accent = tone ? accents?.[tone] : undefined;
  return (
    <View
      className={cn(
        "flex-row items-center self-start rounded-full border",
        size === "sm" ? "gap-1 px-2 py-0.5" : "gap-1.5 px-2.5 py-1",
        !accent && "border-transparent bg-secondary",
        className
      )}
      style={accent ? { borderColor: accent, backgroundColor: withAlpha(accent, 0.15) } : undefined}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      {icon ? <NativeIcon name={icon} size={size === "sm" ? 12 : 14} {...(accent ? { color: accent } : {})} /> : null}
      <Text
        className={cn(
          "font-semibold",
          size === "sm" ? "text-xs" : "text-sm",
          accent ? "text-foreground" : "text-secondary-foreground",
          textClassName
        )}
      >
        {label}
      </Text>
    </View>
  );
}

export { NativeTierBadge };
