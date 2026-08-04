/**
 * Primitives sample index. Routes consumers through every C2-C5 primitive
 * sample screen so visual + interaction behavior can be exercised in one
 * place. Order mirrors STATUS.yml C2.x → C3.x → C4.x → C5.x.
 */
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  NativeListItem,
  NativeListItemDivider,
  NativeText,
} from "@marktiderman/genesis-ui-native";

const sections: { title: string; items: { href: string; title: string; subtitle: string }[] }[] = [
  {
    title: "C2 — Tier-1 primitives",
    items: [
      { href: "/primitives/toast", title: "Toast / Snackbar", subtitle: "Provider + queue" },
      { href: "/primitives/sheet", title: "Sheet", subtitle: "Bottom sheet (gorhom-backed)" },
      { href: "/primitives/popover", title: "Popover", subtitle: "Anchored content" },
      { href: "/primitives/drawer", title: "Drawer", subtitle: "Left/right side panel" },
      { href: "/primitives/accordion", title: "Accordion", subtitle: "Single + multiple expand" },
      { href: "/primitives/combobox", title: "Combobox", subtitle: "Filtered autocomplete" },
      { href: "/primitives/date-time-picker", title: "Date / Time picker", subtitle: "Native dialog" },
      { href: "/primitives/number-input", title: "NumberInput", subtitle: "Stepper + keypad" },
    ],
  },
  {
    title: "C3 — Tier-2 primitives",
    items: [
      { href: "/primitives/stepper", title: "Stepper", subtitle: "Multi-step indicator" },
      { href: "/primitives/slider", title: "Slider + Range", subtitle: "Single + dual thumb" },
      { href: "/primitives/segmented", title: "Segmented control", subtitle: "iOS-style picker" },
      { href: "/primitives/chip-group", title: "ChipGroup", subtitle: "Filter pills" },
      { href: "/primitives/pagination", title: "Pagination", subtitle: "Page navigator" },
      { href: "/primitives/empty-state", title: "EmptyState", subtitle: "first-run / no-results / error" },
      { href: "/primitives/inline-alert", title: "InlineAlert + Banner", subtitle: "System messaging" },
    ],
  },
  {
    title: "C4 — Composite patterns",
    items: [
      { href: "/primitives/list-item", title: "ListItem", subtitle: "Pressable rows" },
      { href: "/primitives/section-list", title: "SectionList header", subtitle: "Grouped lists" },
      { href: "/primitives/search-bar", title: "SearchBar", subtitle: "Cancel + clear + voice" },
      { href: "/primitives/refresh-control", title: "RefreshControl", subtitle: "Token-aware tint" },
    ],
  },
  {
    title: "C5 — Card two-form",
    items: [
      { href: "/primitives/header-card", title: "Card + HeaderCard", subtitle: "90% flat / 10% structured" },
    ],
  },
];

export default function PrimitivesIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1">
        <View className="p-4">
          <NativeText preset="h1">Genesis primitives</NativeText>
          <NativeText preset="body" className="text-muted-foreground">
            PRD-07 Phase C2-C5 sample screens.
          </NativeText>
        </View>
        {sections.map((section) => (
          <View key={section.title}>
            <View className="border-b border-border bg-muted px-4 py-2">
              <NativeText preset="caption" className="uppercase tracking-wider text-muted-foreground">
                {section.title}
              </NativeText>
            </View>
            {section.items.map((item, i) => (
              <View key={item.href}>
                <NativeListItem
                  testID={`primitive-${item.href.split("/").pop()}`}
                  title={item.title}
                  subtitle={item.subtitle}
                  showChevron
                  onPress={() => router.push(item.href as never)}
                />
                {i < section.items.length - 1 ? <NativeListItemDivider /> : null}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
