import { Stack } from "expo-router";
import { useState } from "react";
import { Switch } from "react-native";
import {
  NativeBadge,
  NativeText,
  SettingsPage,
  getSettingsPageStackOptions,
} from "@marktiderman/genesis-ui-native";

/**
 * E1 sample — exercises every section type SettingsPage supports:
 *   - Section with title + chevron rows (Account)
 *   - Section with title + non-chevron rows (subtitle + trailing badge)
 *   - Section with footnote (compliance / hint copy)
 *   - Untitled section (rare, but supported)
 *   - Dangerous-action footer (Sign out + Delete account)
 *   - Optional pre-section header content (profile card slot)
 *
 * Demonstrates Layer-3/4 customization: the screen itself is ~3 lines
 * (Stack.Screen options + <SettingsPage>) and the rest is content data.
 */
export default function SettingsLayoutSample() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  return (
    <>
      <Stack.Screen
        options={getSettingsPageStackOptions({
          headerTitle: "Settings (E1)",
        })}
      />
      <SettingsPage
        testID="settings"
        sections={[
          {
            id: "account",
            title: "Account",
            rows: [
              {
                id: "name",
                title: "Name",
                subtitle: "Sample User",
                showChevron: true,
                onPress: () => {},
              },
              {
                id: "email",
                title: "Email",
                subtitle: "user@example.com",
                showChevron: true,
                onPress: () => {},
              },
              {
                id: "password",
                title: "Change password",
                showChevron: true,
                onPress: () => {},
              },
            ],
          },
          {
            id: "notifications",
            title: "Notifications",
            footnote:
              "We will only send notifications you explicitly opt into.",
            rows: [
              {
                id: "push",
                title: "Push notifications",
                trailing: (
                  <Switch
                    testID="settings-row-push-switch"
                    value={pushEnabled}
                    onValueChange={setPushEnabled}
                  />
                ),
              },
              {
                id: "email-prefs",
                title: "Email digests",
                subtitle: "Weekly summary every Monday",
                trailing: (
                  <Switch
                    testID="settings-row-email-prefs-switch"
                    value={emailEnabled}
                    onValueChange={setEmailEnabled}
                  />
                ),
              },
            ],
          },
          {
            id: "about",
            title: "About",
            rows: [
              {
                id: "version",
                title: "Version",
                trailing: <NativeBadge variant="outline">1.0.0</NativeBadge>,
              },
              {
                id: "license",
                title: "Open-source licenses",
                showChevron: true,
                onPress: () => {},
              },
              {
                id: "privacy",
                title: "Privacy policy",
                showChevron: true,
                onPress: () => {},
              },
            ],
          },
          {
            id: "untitled-utility",
            // No title — demonstrates an untitled section between named ones.
            rows: [
              {
                id: "support",
                title: "Help & support",
                showChevron: true,
                onPress: () => {},
              },
            ],
          },
        ]}
        dangerousActions={[
          { label: "Sign out", onPress: () => {} },
          {
            label: "Delete account",
            onPress: () => {},
            emphasized: true,
          },
        ]}
      >
        <NativeText preset="body-sm" className="text-muted-foreground">
          Settings sample — composes <NativeText preset="caption">SettingsPage</NativeText>{" "}
          with five sections + a dangerous-action footer. Every row has a stable testID for Maestro.
        </NativeText>
      </SettingsPage>
    </>
  );
}
