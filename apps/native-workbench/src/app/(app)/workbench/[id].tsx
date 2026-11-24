import { useLocalSearchParams } from "expo-router";
import { NativeEmptyState } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import { workbenchScreen } from "@/workbench/registry";

/** One registered workbench screen, by id. */
export default function WorkbenchScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = workbenchScreen(String(id));
  if (!entry) {
    return (
      <ScreenContainer header={{ headerTitle: "Not found", large: false }} testID="workbench-missing">
        <NativeEmptyState title="No such workbench screen" body={`Nothing is registered as "${String(id)}".`} />
      </ScreenContainer>
    );
  }
  const Screen = entry.screen;
  return <Screen />;
}
