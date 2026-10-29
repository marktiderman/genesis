// Stand-ins for the optional native modules an app passes to
// GenesisModulesProvider. Each records how Genesis called it, so a test can
// assert the opt-in path, and renders plain DOM so the tree stays testable.
import * as React from "react";
import { type Mock, vi } from "vitest";
import type {
  GenesisDatePickerProps,
  GenesisGlassModule,
  GenesisImageProps,
  GenesisListProps,
  GenesisReanimatedModule,
  GenesisSymbolProps,
} from "../native-modules";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode; testID?: string };

type FakeReanimated = Omit<GenesisReanimatedModule, "useAnimatedStyle" | "withTiming" | "withRepeat" | "cancelAnimation"> & {
  useAnimatedStyle: Mock<(updater: () => Record<string, unknown>) => Record<string, unknown>>;
  withTiming: Mock<(toValue: number) => number>;
  withRepeat: Mock<(animation: number) => number>;
  cancelAnimation: Mock<() => void>;
};

export function fakeReanimated(): FakeReanimated {
  const AnimatedView = React.forwardRef<HTMLDivElement, AnyProps>(function AnimatedView({ children, testID, style, className, accessibilityLabel, accessibilityRole }, ref) {
    return (
      <div
        ref={ref}
        data-reanimated="true"
        data-testid={testID}
        data-style={JSON.stringify(style)}
        className={className as string}
        aria-label={accessibilityLabel as string}
        role={accessibilityRole as string}
      >
        {children as React.ReactNode}
      </div>
    );
  });
  const mod = {
    default: { View: AnimatedView },
    useSharedValue: <V,>(initial: V) => React.useRef({ value: initial }).current,
    useAnimatedStyle: vi.fn((updater: () => Record<string, unknown>) => updater()),
    withTiming: vi.fn((toValue: number) => toValue),
    withRepeat: vi.fn((animation: number) => animation),
    cancelAnimation: vi.fn(),
    Easing: { inOut: (e: unknown) => e, ease: "ease", out: (e: unknown) => e, cubic: "cubic" },
    ReduceMotion: { System: "system", Always: "always", Never: "never" },
  };
  return mod satisfies GenesisReanimatedModule as FakeReanimated;
}

export function fakeGlass({ liquid = true, api = true, throws = false } = {}) {
  const GlassView = vi.fn(({ children, testID }: AnyProps) => (
    <div data-glass="true" data-testid={testID}>
      {children as React.ReactNode}
    </div>
  ));
  return {
    GlassView: GlassView as unknown as GenesisGlassModule["GlassView"],
    isLiquidGlassAvailable: () => {
      if (throws) throw new Error("no glass");
      return liquid;
    },
    isGlassEffectAPIAvailable: () => api,
    calls: GlassView,
  };
}

export function fakeImage() {
  return vi.fn((props: GenesisImageProps) => (
    <img
      data-testid={props.testID}
      data-expo-image="true"
      data-recycling-key={props.recyclingKey ?? ""}
      data-cache-policy={props.cachePolicy}
      data-transition={String(props.transition)}
      src={typeof props.source === "object" && props.source ? props.source.uri : undefined}
      onLoad={() => props.onLoad?.({})}
      onError={() => props.onError?.({})}
      alt=""
    />
  ));
}

export function fakeFlashList() {
  return vi.fn(function FlashList(props: GenesisListProps<any>) {
    const header = props.ListHeaderComponent as React.ReactNode;
    const empty = props.ListEmptyComponent as React.ReactNode;
    return (
      <div
        data-testid={props.testID}
        data-flash-list="true"
        data-sticky={JSON.stringify(props.stickyHeaderIndices ?? [])}
        data-sticky-offset={props.stickyHeaderConfig?.offset}
      >
        {header}
        {props.data.length === 0
          ? empty
          : props.data.map((item, index) => (
              <div key={props.keyExtractor ? props.keyExtractor(item, index) : index} data-item-type={String(props.getItemType?.(item, index) ?? "")}>
                {props.renderItem({ item, index })}
              </div>
            ))}
      </div>
    );
  });
}

export function fakeSymbolView() {
  return vi.fn((props: GenesisSymbolProps) => (
    <span data-symbol={props.name} data-size={props.size} data-weight={props.weight}>
      {props.fallback}
    </span>
  ));
}

export function fakeIcon(name: string) {
  return function Icon({ size, testID }: { size?: number; testID?: string }) {
    return <svg data-lucide={name} data-size={size} data-testid={testID} />;
  };
}

export function fakeDatePicker() {
  return vi.fn((props: GenesisDatePickerProps) => (
    <div
      data-testid={props.testID}
      data-expo-ui-picker="true"
      data-mode={props.mode}
      data-display={props.display ?? ""}
      data-presentation={props.presentation ?? ""}
    >
      <button type="button" data-testid="fake-picker-choose" onClick={() => props.onValueChange?.({}, new Date(2030, 0, 2))}>
        choose
      </button>
      <button type="button" data-testid="fake-picker-cancel" onClick={() => props.onDismiss?.()}>
        cancel
      </button>
    </div>
  ));
}
