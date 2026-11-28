/**
 * Standards: what a preview link opens (PreviewScreen) when the preview isn't on the phone yet.
 * The screen runs on its own updates block over a stand-in for expo-updates, so no real channel
 * is needed: the first check finds nothing published (or a preview that crashed here before), and
 * the next one finds it. Nothing here touches the app's own updates or its channel.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { NativeButton } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import {
  PreviewScreen,
  UpdatesProvider,
  createUpdates,
  type UpdatesModuleLike,
  type UpdatesStorageLike,
} from "@marktiderman/genesis-native/updates";
import type { WorkbenchScreen } from "../registry";

type Scenario = "none" | "failed";

/** expo-updates as the workbench needs it: the first check answers `scenario`, later ones find the preview. */
function standInUpdates(scenario: Scenario): UpdatesModuleLike {
  let checks = 0;
  const manifest = { id: "workbench-preview", runtimeVersion: "1.0.0" };
  return {
    isEnabled: true,
    updateId: "workbench-running",
    channel: "production",
    runtimeVersion: "1.0.0",
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    checkForUpdateAsync: async () => {
      checks += 1;
      // The preview screen's own check is the first one this block makes.
      if (checks === 1) {
        const reason = scenario === "failed" ? "updatePreviouslyFailed" : "noUpdateAvailableOnServer";
        return { isAvailable: false, isRollBackToEmbedded: false, reason } as never;
      }
      return { isAvailable: true, isRollBackToEmbedded: false, manifest } as never;
    },
    fetchUpdateAsync: async () => ({ isNew: true, isRollBackToEmbedded: false, manifest }) as never,
    // The workbench never restarts into the stand-in's preview.
    reloadAsync: async () => {},
    setUpdateRequestHeadersOverride: () => {},
  };
}

function memoryStorage(): UpdatesStorageLike {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  };
}

function Preview() {
  const header = useMemo(() => ({ headerTitle: "Preview link", large: false }), []);
  const [scenario, setScenario] = useState<Scenario>("none");
  const [run, setRun] = useState(0);
  // A new block for each scenario (and each Start over), so every run starts at confirm.
  const block = useMemo(
    () =>
      createUpdates({
        platform: "ios",
        application: { nativeApplicationVersion: "1.0.0", nativeBuildVersion: "1" },
        updates: standInUpdates(scenario),
        storage: memoryStorage(),
        channels: { enabled: true },
        versionRow: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenario, run],
  );
  const restart = (next: Scenario) => {
    setScenario(next);
    setRun((n) => n + 1);
  };
  return (
    <ScreenContainer header={header} scroll testID="workbench-preview-screen">
      <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
        <NativeButton testID="workbench-preview-screen-none" variant={scenario === "none" ? "default" : "outline"} onPress={() => restart("none")}>
          Not published yet
        </NativeButton>
        <NativeButton testID="workbench-preview-screen-failed" variant={scenario === "failed" ? "default" : "outline"} onPress={() => restart("failed")}>
          Crashed before
        </NativeButton>
      </View>
      <UpdatesProvider key={`${scenario}-${run}`} block={block}>
        <PreviewScreen channel="pr-7" onDone={() => restart(scenario)} />
      </UpdatesProvider>
    </ScreenContainer>
  );
}

export const previewScreen: WorkbenchScreen = {
  id: "preview-screen",
  title: "Preview link",
  summary:
    "PreviewScreen when the preview isn't on the phone yet: it says a fresh push may still be publishing and offers Try again first (which loads it here), or says a preview that crashed before won't load again.",
  section: "Standards",
  package: "genesis-native",
  covers: ["PreviewScreen"],
  screen: Preview,
};
