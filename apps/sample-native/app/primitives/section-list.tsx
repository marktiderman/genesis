import { SectionList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeListItem,
  NativeSectionListHeader,
  NativeText,
} from "@marktiderman/genesis-ui-native";

const sections = [
  {
    title: "General",
    data: [
      { id: "1", label: "Account" },
      { id: "2", label: "Notifications" },
    ],
  },
  {
    title: "Privacy",
    data: [
      { id: "3", label: "Location" },
      { id: "4", label: "Camera" },
    ],
  },
];

export default function SectionListSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <View className="p-4">
        <NativeText preset="h1">SectionList header</NativeText>
      </View>
      <SectionList
        testID="section-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          // No chevron here — the section-list sample demonstrates section
          // structure, not row navigation. A chevron without a real onPress
          // target would mis-signal tap-to-navigate.
          <NativeListItem testID={`row-${item.id}`} title={item.label} />
        )}
        renderSectionHeader={({ section }) => (
          <NativeSectionListHeader title={section.title} />
        )}
      />
    </SafeAreaView>
  );
}
