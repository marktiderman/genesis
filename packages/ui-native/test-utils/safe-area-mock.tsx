// react-native-safe-area-context shim for vitest. Components in this package
// use SafeAreaView for chrome insets; we don't exercise inset math in unit
// tests, just render through.
import * as React from "react";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

export const SafeAreaView = React.forwardRef<HTMLDivElement, AnyProps>(
  function SafeAreaView(props, ref) {
    const { testID, edges, children, ...rest } = props as AnyProps & {
      testID?: string;
      edges?: string[];
    };
    void edges;
    return React.createElement(
      "div",
      { ...rest, "data-testid": testID, ref },
      children,
    );
  },
);
SafeAreaView.displayName = "SafeAreaView";

export const SafeAreaProvider = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

// Stable reference — returning a fresh object each call would make any
// downstream useEffect/useMemo dep that includes insets fire on every render.
const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 } as const;

export function useSafeAreaInsets() {
  return ZERO_INSETS;
}
