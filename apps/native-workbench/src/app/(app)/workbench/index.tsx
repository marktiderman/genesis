import { useMemo } from "react";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import { NativeListItem, NativeText } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import { WORKBENCH_SECTIONS, workbenchScreens } from "@/workbench/registry";

/**
 * The workbench: every Genesis native feature on a screen of its own, by section. A package's
 * screens come from the registry (`src/workbench/registry.ts`).
 */
export default function WorkbenchIndex() {
  const header = useMemo(() => ({ headerTitle: "Workbench" }), []);
  return (
    <ScreenContainer header={header} scroll testID="workbench">
      {WORKBENCH_SECTIONS.map((section) => {
        const screens = workbenchScreens.filter((s) => s.section === section);
        if (screens.length === 0) return null;
        return (
          <View key={section} testID={`workbench-section-${section.toLowerCase()}`}>
            <NativeText style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6, opacity: 0.6 }}>{section.toUpperCase()}</NativeText>
            {screens.map((s) => (
              <NativeListItem key={s.id} title={s.title} subtitle={s.summary} showChevron onPress={() => router.push(`/workbench/${s.id}` as Href)} testID={`workbench-open-${s.id}`} />
            ))}
          </View>
        );
      })}
    </ScreenContainer>
  );
}
