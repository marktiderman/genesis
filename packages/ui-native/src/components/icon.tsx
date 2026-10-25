/**
 * NativeIcon — an icon by what it is for ("settings", "bell"), not by a
 * library's name. On iOS it draws the SF Symbol (expo-symbols' `SymbolView`,
 * passed as `modules.symbol`); on Android and web, and as the SF Symbol's
 * fallback, it draws the icon set given as `modules.icons` (`lucideIcons`
 * from `@marktiderman/genesis-ui-native/icons/lucide`). With neither, it
 * keeps the icon's space empty and warns once in development.
 *
 * Decorative by default (hidden from screen readers). Give `label` when the
 * icon carries meaning on its own, such as an icon-only button's content.
 *
 * @stability Beta
 */
import { Platform, View, type ColorValue } from "react-native";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { SF_SYMBOLS, type NativeIconName } from "../icon-names";
import { useGenesisModules } from "../native-modules";

export interface NativeIconProps {
  name: NativeIconName;
  /** Points. Default 20. */
  size?: number;
  /** Default the theme's label color. */
  color?: ColorValue;
  /** iOS SF Symbol weight. */
  weight?: "ultraLight" | "thin" | "light" | "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  /** Read by screen readers. Without it the icon is decorative and hidden from them. */
  label?: string;
  testID?: string;
}

declare const __DEV__: boolean | undefined;
const warned = new Set<string>();

function warnOnce(name: string) {
  if (typeof __DEV__ === "undefined" || !__DEV__ || warned.has(name)) return;
  warned.add(name);
  console.warn(
    `[genesis] NativeIcon "${name}" has nothing to draw with: pass modules.icons (lucideIcons from "@marktiderman/genesis-ui-native/icons/lucide") and, for SF Symbols on iOS, modules.symbol (SymbolView from "expo-symbols") to GenesisModulesProvider.`,
  );
}

export function NativeIcon({ name, size = 20, color, weight, label, testID }: NativeIconProps) {
  const { symbol: SymbolView, icons } = useGenesisModules();
  const roles = useThemeRoles();
  const tint = color ?? roles.label;
  const a11y = label
    ? { accessible: true, accessibilityRole: "image" as const, accessibilityLabel: label }
    : { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" as const };
  const Fallback = icons?.[name];
  const fallback = Fallback ? <Fallback size={size} color={tint} testID={testID ? `${testID}-fallback` : undefined} /> : null;

  if (Platform.OS === "ios" && SymbolView) {
    return (
      <View {...a11y} testID={testID} style={{ width: size, height: size }}>
        <SymbolView name={SF_SYMBOLS[name]} size={size} tintColor={tint} weight={weight} fallback={fallback} style={{ width: size, height: size }} />
      </View>
    );
  }
  if (!fallback) warnOnce(name);
  return (
    <View {...a11y} testID={testID} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {fallback}
    </View>
  );
}
