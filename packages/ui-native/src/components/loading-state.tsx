/**
 * LoadingState — a centred spinner for a screen (or part of one) that is
 * waiting: a redirect while the session loads, the first fetch of a page.
 *
 * Use it instead of a hand-rolled `<View><ActivityIndicator /></View>`: the
 * spinner takes the theme tint, screen readers hear one "Loading" progress
 * bar (or your `label`), and the full-screen form sits inside the safe area
 * on the screen background. For content-shaped placeholders (a list about to
 * appear) use `NativeSkeleton`; for known progress use `NativeProgress`.
 *
 *   if (!session) return <NativeLoadingState />;            // whole screen
 *   <NativeLoadingState fullScreen={false} label="Loading more" size="small" />
 *
 * `ScreenContainer loading` renders the inline form in place of its body.
 *
 * @stability Beta
 */
import { ActivityIndicator, View, type ColorValue } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "../utils";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeText } from "./text";

export type NativeLoadingStateEdge = "top" | "bottom" | "left" | "right";

export interface NativeLoadingStateProps {
  /** Text shown under the spinner. It is also what screen readers announce. */
  label?: string;
  /** What screen readers announce when no `label` is shown. Default `"Loading"`. */
  accessibilityLabel?: string;
  /** Spinner size. Default `"large"`. */
  size?: "small" | "large";
  /**
   * `true` (default): fill the screen on the theme background, inside the
   * safe area. `false`: a padded, centred block that fills its parent, for a
   * screen body, a section or a list footer.
   */
  fullScreen?: boolean;
  /** Safe-area edges when `fullScreen`. Default all four. */
  safeAreaEdges?: NativeLoadingStateEdge[];
  /** Spinner color. Defaults to the theme tint. */
  color?: ColorValue;
  className?: string;
  /** testID on the root; the spinner is `${testID}-spinner`, the label `${testID}-label`. Default `"loading-state"`. */
  testID?: string;
}

const ALL_EDGES: NativeLoadingStateEdge[] = ["top", "bottom", "left", "right"];

export function NativeLoadingState({
  label,
  accessibilityLabel,
  size = "large",
  fullScreen = true,
  safeAreaEdges = ALL_EDGES,
  color,
  className,
  testID = "loading-state",
}: NativeLoadingStateProps) {
  const roles = useThemeRoles();
  const spoken = label ?? accessibilityLabel ?? "Loading";

  const content = (
    <View
      testID={fullScreen ? `${testID}-content` : testID}
      className={cn("items-center justify-center gap-3 px-4 py-8", !fullScreen && "flex-grow", !fullScreen && className)}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={spoken}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator testID={`${testID}-spinner`} size={size} color={(color ?? roles.tint) as string} />
      {label ? (
        <NativeText testID={`${testID}-label`} preset="body-sm" className="text-muted-foreground text-center">
          {label}
        </NativeText>
      ) : null}
    </View>
  );

  if (!fullScreen) return content;

  return (
    <SafeAreaView
      testID={testID}
      edges={safeAreaEdges}
      className={cn("flex-1 items-center justify-center bg-background", className)}
    >
      {content}
    </SafeAreaView>
  );
}
