/**
 * The default renderers, built from `@marktiderman/genesis-ui-native`. Each
 * is the default of one slot (`forceUpgrade`, `maintenance`, `updateBanner`,
 * `whatsNew`) and is exported on its own.
 */
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeBanner,
  NativeButton,
  NativeEmptyState,
  NativeGlassSurface,
  NativeSheet,
  NativeSheetScrollView,
  NativeText,
  useLiquidGlass,
} from "@marktiderman/genesis-ui-native/components";
import type { ReleaseNote } from "./policy";

export interface ForceUpgradeProps {
  minimumVersion: string;
  installedVersion: string;
  /** The policy's store link for this platform (a minimum without one forces nothing). */
  storeUrl: string;
  /** Opens `storeUrl`. */
  openStore: () => void;
  /** Ask the policy again (it may have been lowered). */
  retry: () => void;
  checking: boolean;
}

/** Blocking: this version is below the minimum. "Update" opens the store. */
export function ForceUpgradeScreen({ minimumVersion, installedVersion, openStore, retry, checking }: ForceUpgradeProps) {
  return (
    <View testID="genesis-force-upgrade" className="flex-1 justify-center bg-background">
      <NativeEmptyState
        variant="first-run"
        title="Update required"
        body={`This version (${installedVersion}) is no longer supported. Update to ${minimumVersion} or later to keep going.`}
        primaryAction={
          <NativeButton onPress={openStore} testID="genesis-force-upgrade-store">
            Update
          </NativeButton>
        }
        secondaryAction={
          <NativeButton variant="ghost" onPress={retry} loading={checking} testID="genesis-force-upgrade-retry">
            Check again
          </NativeButton>
        }
        testID="genesis-force-upgrade-state"
      />
    </View>
  );
}

export interface MaintenanceProps {
  /** The policy's message, or `null` for the default copy. */
  message: string | null;
  retry: () => void;
  retrying: boolean;
}

/** Blocking: the policy says maintenance is on. "Try again" asks again. */
export function MaintenanceScreen({ message, retry, retrying }: MaintenanceProps) {
  return (
    <View testID="genesis-maintenance" className="flex-1 justify-center bg-background">
      <NativeEmptyState
        variant="first-run"
        title="Down for maintenance"
        body={message ?? "We're doing some work on the app. Try again in a few minutes."}
        primaryAction={
          <NativeButton onPress={retry} loading={retrying} testID="genesis-maintenance-retry">
            Try again
          </NativeButton>
        }
        testID="genesis-maintenance-state"
      />
    </View>
  );
}

export interface UpdateBannerProps {
  /** Reload into the downloaded update (refused while `canReload` is false). */
  reload: () => void;
  /** Hide the banner; the update still applies on the next cold start. */
  dismiss: () => void;
  /** False while something is mid-edit (`useBlockReload`) or your `canReload` says no. */
  canReload: boolean;
  /** The last tap was refused because something is mid-edit. */
  blocked: boolean;
  reloading: boolean;
}

/**
 * Non-blocking: floats over the top of the screens while an update is
 * downloaded. Liquid Glass on iOS 26 when the app passed expo-glass-effect
 * (`modules.glass`); the solid secondary surface otherwise.
 */
export function UpdateBanner({ reload, dismiss, canReload, blocked, reloading }: UpdateBannerProps) {
  // On glass the message drops its own fill, or it would cover the glass.
  const onGlass = useLiquidGlass() !== null;
  return (
    <SafeAreaView edges={["top"]} pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
      <View className="mx-3 mt-2">
        <NativeGlassSurface testID="genesis-update-banner" fallbackClassName="overflow-hidden rounded-lg border border-border bg-secondary">
          <NativeBanner
            variant="info"
            title="An update is ready"
            description={blocked || !canReload ? "Finish what you're doing, then restart to use it." : "Restart to use the latest version."}
            className={onGlass ? "border-b-0 border-transparent bg-transparent" : "border-b-0"}
            testID="genesis-update-banner-message"
          />
          <View className="flex-row justify-end gap-2 px-4 pb-3">
            <NativeButton variant="ghost" size="sm" onPress={dismiss} testID="genesis-update-banner-later">
              Later
            </NativeButton>
            <NativeButton size="sm" onPress={reload} disabled={!canReload} loading={reloading} testID="genesis-update-banner-restart">
              Restart
            </NativeButton>
          </View>
        </NativeGlassSurface>
      </View>
    </SafeAreaView>
  );
}

export interface WhatsNewProps {
  /** Newest first. */
  notes: readonly ReleaseNote[];
  /** The installed version. */
  version: string | null;
  /** Close and remember this version. */
  dismiss: () => void;
}

/** The release notes for this version, once, in a sheet. */
export function WhatsNewSheet({ notes, dismiss }: WhatsNewProps) {
  return (
    <NativeSheet open onOpenChange={(open) => (open ? undefined : dismiss())} testID="genesis-whats-new">
      {/* The notes scroll once they pass the sheet's height. */}
      <NativeSheetScrollView contentContainerClassName="gap-4 p-6">
        <NativeText preset="h3" accessibilityRole="header">
          What's new
        </NativeText>
        {notes.map((note) => (
          <View key={note.version} className="gap-1" testID={`genesis-whats-new-${note.version}`}>
            <NativeText preset="label">{note.title ?? `Version ${note.version}`}</NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              {note.body}
            </NativeText>
          </View>
        ))}
        <NativeButton onPress={dismiss} testID="genesis-whats-new-done">
          Got it
        </NativeButton>
      </NativeSheetScrollView>
    </NativeSheet>
  );
}
