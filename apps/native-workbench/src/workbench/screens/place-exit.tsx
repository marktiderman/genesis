/**
 * Standards: a place that hides the tab bar for its whole stack goes back to where the person
 * came from (createPlaceExit). Here the place is this screen: it remembers the last path outside it.
 */
import { useMemo } from "react";
import { NativeText } from "@marktiderman/genesis-ui-native";
import { ScreenContainer, createPlaceExit } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";

export const workbenchExit = createPlaceExit((path) => path.startsWith("/standards/place-exit"));

function PlaceExit() {
  const header = useMemo(() => ({ headerTitle: "Place exit", large: false }), []);
  return (
    <ScreenContainer header={header} scroll testID="workbench-place-exit">
      <NativeText testID="workbench-place-exit-path" style={{ padding: 20 }}>
        Back from here would go to: {workbenchExit.exitPath("/")}
      </NativeText>
    </ScreenContainer>
  );
}

export const placeExit: WorkbenchScreen = {
  id: "place-exit",
  title: "Place exit",
  summary: "createPlaceExit remembers the last path outside a place (here, this screen) for its back button.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["createPlaceExit"],
  screen: PlaceExit,
};
