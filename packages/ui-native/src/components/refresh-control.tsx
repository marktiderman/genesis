/**
 * RefreshControl wrapper — token-aware tint over RN's RefreshControl.
 *
 * Use as the `refreshControl` prop on ScrollView / FlatList / SectionList.
 * The tint defaults to a CSS-variable resolved at runtime via the theme
 * provider; consumers can override per-call. We re-export RN's
 * RefreshControl shape so the API mirrors what consumers already know.
 *
 * @stability Beta
 */
// Lazy resolve of the RN export so we don't break in environments where
// react-native isn't fully bundled (e.g. metro server warm-up).
function resolveRefreshControl(): React.ComponentType<NativeRefreshControlProps> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("react-native");
    return rn.RefreshControl as React.ComponentType<NativeRefreshControlProps>;
  } catch {
    return null;
  }
}

export interface NativeRefreshControlProps {
  refreshing: boolean;
  onRefresh: () => void;
  /** Hex / RGB color override. Falls back to the theme primary. */
  tintColor?: string;
  /** Title shown under the iOS spinner. */
  title?: string;
  /** Color of the iOS title text. */
  titleColor?: string;
  /** Android colors prop (an array of progress colors). */
  colors?: string[];
  /** Android progress background. */
  progressBackgroundColor?: string;
  testID?: string;
}

/**
 * Resolves the active theme's primary color for use as the RefreshControl
 * tint. Returns undefined on platforms where the theme provider isn't
 * mounted (consumer can still pass `tintColor` explicitly).
 */
// Keep the design-system hook resolution outside the render path. We
// resolve the hook reference once at module load; if the consumer isn't
// using genesis-design-system, we fall back to undefined and only the
// caller-provided tintColor / colors apply. Using a ref-style closure
// avoids conditional hooks (which would violate the rules of hooks).
const useGenesisThemeRef: (() => { colors?: { primary?: string } }) | null =
  (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const provider = require("@marktiderman/genesis-design-system/providers/native");
      return provider.useGenesisTheme ?? null;
    } catch {
      return null;
    }
  })();

export function NativeRefreshControl(props: NativeRefreshControlProps) {
  const RC = resolveRefreshControl();
  const theme = useGenesisThemeRef ? useGenesisThemeRef() : null;
  const themePrimary = theme?.colors?.primary;
  if (!RC) return null;
  return (
    <RC
      tintColor={props.tintColor ?? themePrimary}
      colors={props.colors ?? (themePrimary ? [themePrimary] : undefined)}
      {...props}
      testID={props.testID ?? "native-refresh-control"}
    />
  );
}
