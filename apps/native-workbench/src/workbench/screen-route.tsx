import { useLocalSearchParams } from "expo-router";
import { NativeEmptyState } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import { workbenchScreen } from "./registry";

const MISSING_HEADER = { headerTitle: "Not found", large: false };

/** One registered screen, by id: every section's `[id]` route. */
export function WorkbenchScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = workbenchScreen(String(id));
  if (!entry) {
    return (
      <ScreenContainer header={MISSING_HEADER} testID="workbench-missing">
        <NativeEmptyState title="No such screen" body={`Nothing is registered as "${String(id)}".`} />
      </ScreenContainer>
    );
  }
  const Screen = entry.screen;
  return <Screen />;
}
