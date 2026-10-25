/**
 * NativeGlassSurface — a floating surface (toast, banner, floating bar) drawn
 * as iOS 26 Liquid Glass when it can be, and as the solid surface it always
 * was otherwise.
 *
 * Glass needs all of: iOS; expo-glass-effect passed as `modules.glass`;
 * `isLiquidGlassAvailable()` (the app was built with the iOS 26 SDK and the
 * device runs it) and `isGlassEffectAPIAvailable()` (the API exists at run
 * time; some iOS 26 betas lack it) both true; and Reduce Transparency off.
 * Otherwise `fallbackClassName` paints the surface.
 *
 * @stability Beta
 */
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { cn } from "../utils";
import { useGenesisModules, type GenesisGlassModule } from "../native-modules";
import { useThemeMode } from "../hooks/use-theme-mode";

const availability = new WeakMap<GenesisGlassModule, boolean>();

function glassAvailable(glass: GenesisGlassModule): boolean {
  const known = availability.get(glass);
  if (known !== undefined) return known;
  let ok = false;
  if (typeof glass.isLiquidGlassAvailable !== "function" || typeof glass.isGlassEffectAPIAvailable !== "function" || !glass.GlassView) {
    // An expo-glass-effect without both checks (or not the module namespace)
    // can't say glass is safe to draw: stay solid, and say why.
    warnDev(
      "[genesis] modules.glass needs expo-glass-effect's GlassView, isLiquidGlassAvailable and isGlassEffectAPIAvailable (pass `import * as GlassEffect from \"expo-glass-effect\"`, SDK 54 or later). Surfaces stay solid.",
    );
  } else {
    try {
      ok = Boolean(glass.isLiquidGlassAvailable()) && Boolean(glass.isGlassEffectAPIAvailable());
    } catch {
      ok = false;
    }
  }
  availability.set(glass, ok);
  return ok;
}

declare const __DEV__: boolean | undefined;

function warnDev(message: string) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(message);
}

/** True while the user has Reduce Transparency on (iOS). Always false elsewhere. */
export function useReduceTransparency(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios" || typeof AccessibilityInfo.isReduceTransparencyEnabled !== "function") return undefined;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceTransparencyChanged", (v: boolean) => mounted && setReduced(v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** expo-glass-effect's `GlassView` when Liquid Glass can be drawn here, else `null`. */
export function useLiquidGlass(): GenesisGlassModule["GlassView"] | null {
  const { glass } = useGenesisModules();
  const reduceTransparency = useReduceTransparency();
  if (Platform.OS !== "ios" || !glass || reduceTransparency) return null;
  return glassAvailable(glass) ? glass.GlassView : null;
}

export interface NativeGlassSurfaceProps {
  children?: ReactNode;
  /** Inner layout classes, applied in both looks (padding, gap). Place the surface from its parent. */
  className?: string;
  /** The solid look when glass can't be drawn, radius included. Default `"rounded-xl border border-border bg-card"`. */
  fallbackClassName?: string;
  /** The glass's corner radius in points. Default 16. */
  radius?: number;
  /** Glass tint (a color string). */
  tintColor?: string;
  /** Glass reacts to touch. Default false. */
  interactive?: boolean;
  /** Default `"regular"`. */
  glassEffectStyle?: "regular" | "clear";
  testID?: string;
}

export function NativeGlassSurface({
  children,
  className,
  fallbackClassName = "rounded-xl border border-border bg-card",
  radius = 16,
  tintColor,
  interactive = false,
  glassEffectStyle = "regular",
  testID,
}: NativeGlassSurfaceProps) {
  const GlassView = useLiquidGlass();
  // The app's scheme, not the system's, so the glass matches the text on it.
  const colorScheme = useThemeMode();
  if (GlassView) {
    return (
      <GlassView
        testID={testID}
        style={{ borderRadius: radius, overflow: "hidden" }}
        glassEffectStyle={glassEffectStyle}
        colorScheme={colorScheme}
        tintColor={tintColor}
        isInteractive={interactive}
      >
        <View className={className}>{children}</View>
      </GlassView>
    );
  }
  return (
    <View testID={testID} className={cn(fallbackClassName, className)}>
      {children}
    </View>
  );
}
