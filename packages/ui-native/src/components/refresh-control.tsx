/**
 * RefreshControl wrapper — token-aware tint over RN's RefreshControl.
 *
 * Use as the `refreshControl` prop on ScrollView / FlatList / SectionList.
 * The tint defaults to the theme's `tint` role; consumers can override
 * per-call. We re-export RN's
 * RefreshControl shape so the API mirrors what consumers already know.
 *
 * @stability Beta
 */
import { RefreshControl } from "react-native";
import { useThemeRoles } from "../hooks/use-theme-roles";

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
 * Pull to refresh, tinted with the theme's `tint` role. Works under any Genesis root.
 */
// The tint comes from `useThemeRoles`, not `useGenesisTheme` from `providers/native`: that is
// another context, which the native app shell's `GenesisThemeProvider` never mounts, so it threw there.
export function NativeRefreshControl({ tintColor, colors, testID, ...rest }: NativeRefreshControlProps) {
  const tint = useThemeRoles().tint;
  const androidTint = typeof tint === "string" ? [tint] : undefined;
  return <RefreshControl {...rest} tintColor={tintColor ?? (tint as string)} colors={colors ?? androidTint} testID={testID ?? "native-refresh-control"} />;
}
