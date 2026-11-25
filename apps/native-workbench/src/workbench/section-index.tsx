import { useMemo } from "react";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import { NativeListItem, NativeText } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import { workbenchScreens, type WorkbenchSection } from "./registry";

/** The route segment of each section's tab. */
export const SECTION_ROUTE: Record<WorkbenchSection, string> = {
  Standards: "standards",
  Components: "components",
  Layouts: "layouts",
  Messages: "messages",
};

const SECTION_INTRO: Record<WorkbenchSection, string> = {
  Standards: "How every Genesis app behaves on iOS: the native header, the tab bar, a row's actions and the way back.",
  Components: "The pieces screens are made of, with sample data you can touch.",
  Layouts: "Whole pages Genesis composes from the pieces.",
  Messages: "Genesis chat's native surface: the inbox and the conversation.",
};

/** A section's tab: its screens, grouped by the package that ships them. */
export function SectionIndex({ section }: { section: WorkbenchSection }) {
  const header = useMemo(() => ({ headerTitle: section }), [section]);
  const screens = workbenchScreens.filter((s) => s.section === section);
  const packages = [...new Set(screens.map((s) => s.package))];
  const route = SECTION_ROUTE[section];
  return (
    <ScreenContainer header={header} scroll testID={`workbench-${route}`}>
      <NativeText style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, opacity: 0.7 }}>{SECTION_INTRO[section]}</NativeText>
      {packages.map((pkg) => (
        <View key={pkg} testID={`workbench-${route}-${pkg}`}>
          <NativeText style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6, fontSize: 13, opacity: 0.6 }}>{pkg.toUpperCase()}</NativeText>
          {screens
            .filter((s) => s.package === pkg)
            .map((s) => (
              <NativeListItem key={s.id} title={s.title} subtitle={s.summary} showChevron onPress={() => router.push(`/${route}/${s.id}` as Href)} testID={`workbench-open-${s.id}`} />
            ))}
        </View>
      ))}
    </ScreenContainer>
  );
}
