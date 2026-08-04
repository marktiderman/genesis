import { Stack, useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  NativeInput,
  NativeText,
  NativeSwitch,
  SettingsSubPage,
  confirmDiscardChanges,
  getSettingsSubPageStackOptions,
} from "@marktiderman/genesis-ui-native";
import { View } from "react-native";

/**
 * E2 sample — drill-in detail page demonstrating:
 *   - KeyboardAvoidingView wrapper
 *   - Save action surfaced in the nav bar via getSettingsSubPageStackOptions
 *   - dirty-state guard (Save disabled until form changes)
 *   - optimistic-save pattern
 *
 * The form is intentionally simple (display name + email + push toggle)
 * so consumers see the layout shape, not the form complexity.
 */
export default function SettingsSubLayoutSample() {
  const [name, setName] = useState("Sample User");
  const [email, setEmail] = useState("user@example.com");
  const [pushPref, setPushPref] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track initial state via a ref (NOT useState) — the baseline snapshot
  // is mutable, must not retrigger renders when it advances after a save.
  const initialRef = useRef({
    name: "Sample User",
    email: "user@example.com",
    pushPref: true,
  });
  const dirty =
    name !== initialRef.current.name ||
    email !== initialRef.current.email ||
    pushPref !== initialRef.current.pushPref;

  async function handleSave() {
    setSaving(true);
    // Optimistic save — in real consumers this would update local cache
    // immediately, dispatch the network mutation, and roll back on error.
    await new Promise((r) => setTimeout(r, 600));
    initialRef.current = { name, email, pushPref };
    setSaving(false);
  }

  // Navigator-level dirty-form leave guard (PRD-07 E2.1 — required for the
  // sample to honestly demonstrate the pattern). Consumers wire this in
  // their own screen because the navigator instance is screen-local.
  const navigation = useNavigation();
  useEffect(() => {
    if (!dirty) return undefined;
    // expo-router exposes the React Navigation `addListener` API; we
    // intercept `beforeRemove` (the standard React-Navigation event) to
    // pop a confirm dialog when the user has unsaved changes.
    const sub = (
      navigation as unknown as {
        addListener: (
          event: string,
          cb: (e: { preventDefault: () => void; data?: unknown }) => void,
        ) => () => void;
      }
    ).addListener("beforeRemove", (event) => {
      event.preventDefault();
      confirmDiscardChanges(() => {
        // User opted to discard — replay the navigation by dispatching the
        // same action without our listener interfering.
        (navigation as unknown as { dispatch: (action: unknown) => void })
          .dispatch((event.data as { action?: unknown })?.action);
      });
    });
    return sub;
  }, [navigation, dirty]);

  return (
    <>
      <Stack.Screen
        options={getSettingsSubPageStackOptions({
          headerTitle: "Edit profile (E2)",
          dirty,
          saving,
          onSave: handleSave,
        })}
      />
      <SettingsSubPage
        testID="settings-sub"
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
      >
        <NativeText preset="body-sm" className="text-muted-foreground">
          Edit your profile. The Save button in the nav bar enables once
          any field changes; tap it to commit.
        </NativeText>

        <NativeInput
          testID="settings-sub-name"
          label="Display name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <NativeInput
          testID="settings-sub-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <View
          testID="settings-sub-push-row"
          className="flex-row items-center justify-between rounded-md border border-border bg-card p-4"
        >
          <View className="flex-1 pr-4">
            <NativeText preset="body" className="font-medium">
              Push notifications
            </NativeText>
            <NativeText preset="body-sm" className="text-muted-foreground">
              Send important updates to this device.
            </NativeText>
          </View>
          <NativeSwitch
            testID="settings-sub-push-switch"
            checked={pushPref}
            onCheckedChange={setPushPref}
          />
        </View>
      </SettingsSubPage>
    </>
  );
}
