/**
 * TabBar — a bottom tab bar with any number of tabs.
 *
 * Built on NativeTabs (each slot is a NativeTabsTrigger). Up to `max` (5) tabs show; past that,
 * the first four show and the fifth slot is "More", which opens a NativeSheet with the rest.
 * The twin of genesis-ui's `TabBar` (the same props, and the same split as AppShell's phone
 * bottom nav). For an Expo Router app's own tabs, the router's tab bar comes first; this is for
 * a bar the screen owns (tabs that aren't routes) or a router `tabBar` render.
 *
 * @stability Beta
 */
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "../utils";
import { NativeBadge } from "./badge";
import { NativeIcon } from "./icon";
import { NativeSheet } from "./sheet";
import { NativeTabs, NativeTabsTrigger } from "./tabs";
import { NativeText } from "./text";

/** Most slots the bar shows before the rest go under "More". */
export const NATIVE_TAB_BAR_MAX = 5;

/** Up to `max` fit; beyond, the first `max - 1` show and the rest go under "More". */
export function splitNativeTabBarItems<T>(items: readonly T[], max: number = NATIVE_TAB_BAR_MAX): { shown: T[]; more: T[] } {
  const slots = Math.max(1, max);
  if (items.length <= slots) return { shown: [...items], more: [] };
  return { shown: items.slice(0, slots - 1), more: items.slice(slots - 1) };
}

/** One tab in a `NativeTabBar`. */
export interface NativeTabBarItem {
  key: string;
  label: string;
  /** Usually `<NativeIcon name="…" />`. */
  icon: ReactNode;
  /** A count or a short word beside the icon. */
  badge?: ReactNode;
}

export interface NativeTabBarProps {
  items: readonly NativeTabBarItem[];
  /** The current tab's key. */
  value: string;
  onChange: (key: string) => void;
  /** Slots before "More" takes the last. Default 5. */
  max?: number;
  /** "More" (the last slot's label and the sheet's title). */
  moreLabel?: string;
  className?: string;
  testID?: string;
}

function Slot({ item, active }: { item: Pick<NativeTabBarItem, "label" | "icon" | "badge">; active: boolean }) {
  return (
    <View className="items-center gap-1">
      <View>
        {item.icon}
        {item.badge != null ? (
          <View className="absolute -right-3 -top-1.5 min-w-4 items-center rounded-full bg-primary px-1">
            <Text className="text-[10px] font-semibold text-primary-foreground">{item.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>
        {item.label}
      </Text>
    </View>
  );
}

export function NativeTabBar({
  items,
  value,
  onChange,
  max = NATIVE_TAB_BAR_MAX,
  moreLabel = "More",
  className,
  testID = "native-tab-bar",
}: NativeTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { shown, more } = splitNativeTabBarItems(items, max);
  const moreActive = more.some((item) => item.key === value);
  return (
    <NativeTabs defaultValue={value} value={value} onValueChange={onChange} testID={testID}>
      <View accessibilityRole="tablist" className={cn("flex-row border-t border-border bg-background pt-1", className)}>
        {shown.map((item) => (
          <NativeTabsTrigger
            key={item.key}
            value={item.key}
            testID={`${testID}-${item.key}`}
            className="min-h-[49px] rounded-none bg-transparent px-1 py-1 shadow-none"
          >
            <Slot item={item} active={item.key === value} />
          </NativeTabsTrigger>
        ))}
        {more.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={moreActive ? `${moreLabel}, current tab inside` : moreLabel}
            accessibilityState={{ expanded: moreOpen, selected: moreActive }}
            onPress={() => setMoreOpen(true)}
            testID={`${testID}-more`}
            className="min-h-[49px] flex-1 items-center justify-center px-1 py-1"
          >
            <Slot item={{ label: moreLabel, icon: <NativeIcon name="more" /> }} active={moreActive} />
          </Pressable>
        ) : null}
      </View>
      {more.length > 0 ? (
        <NativeSheet open={moreOpen} onOpenChange={setMoreOpen} fitContent testID={`${testID}-more-sheet`}>
          <View className="gap-1 p-4">
            <NativeText preset="h4" accessibilityRole="header" className="mb-2">
              {moreLabel}
            </NativeText>
            {more.map((item) => {
              const active = item.key === value;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setMoreOpen(false);
                    onChange(item.key);
                  }}
                  testID={`${testID}-${item.key}`}
                  className={cn("min-h-[44px] flex-row items-center gap-3 rounded-lg px-3", active && "bg-accent")}
                >
                  {item.icon}
                  <Text className={cn("flex-1 text-base font-medium", active ? "text-primary" : "text-foreground")}>{item.label}</Text>
                  {item.badge != null ? <NativeBadge variant="secondary">{item.badge}</NativeBadge> : null}
                </Pressable>
              );
            })}
          </View>
        </NativeSheet>
      ) : null}
    </NativeTabs>
  );
}
