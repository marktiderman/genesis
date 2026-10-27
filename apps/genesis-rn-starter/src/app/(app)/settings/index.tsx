import { useState } from "react";
import { Stack, router, type Href } from "expo-router";
import { Alert } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { useBlockSettings, useSession } from "@marktiderman/genesis-native";
import { useBlockReload } from "@marktiderman/genesis-native/updates";
import { SettingsPage, getSettingsPageStackOptions, type SettingsPageDangerousAction, type SettingsPageRow } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { deleteAccount } from "@/lib/account";
import { devtools } from "@/lib/devtools";
import { observability } from "@/lib/observability";
import { supabase } from "@/lib/supabase";
import { useAppVersion } from "@/lib/updates";

const t = copy.settings;

/** The Settings tab: who is signed in, the version signature (`features.updates`), sign out and (`features.accountDeletion`) delete account. */
export default function SettingsScreen() {
  const { session } = useSession<Session>();
  // While the request runs, "Delete account" does nothing (each try also goes through the confirmation).
  const [busy, setBusy] = useState(false);
  // An update never reloads the app while the deletion request runs.
  useBlockReload(busy);
  const version = useAppVersion();
  const blockSettings = useBlockSettings<SettingsPageRow>(
    [
      { id: "account", title: t.accountSection, rows: [{ id: "email", title: t.signedInAs, subtitle: session?.user.email ?? "" }] },
      {
        id: "general",
        rows: [
          ...(starter.features.chat
            ? [{ id: "availability", title: t.availability, subtitle: t.availabilitySubtitle, showChevron: true, onPress: () => router.push("/settings/availability" as Href), testID: "open-availability" }]
            : []),
          // Off by default (`features.productDemo`).
          ...(starter.features.productDemo
            ? [{ id: "product-demo", title: copy.productDemo.settingsRow, subtitle: copy.productDemo.settingsRowSubtitle, showChevron: true, onPress: () => router.push("/settings/product" as Href), testID: "open-product-demo" }]
            : []),
        ],
      },
      // The support block's Send feedback and Help rows (`features.support`).
      { id: "support", title: copy.support.settings.section, rows: [] },
      {
        id: "about",
        title: t.aboutSection,
        rows: [
          { id: "version", title: t.version, subtitle: version },
          // Development and preview builds only (`features.devtools`).
          ...(devtools?.enabled ? [{ id: "devtools", title: t.devtools, showChevron: true, onPress: devtools.open, testID: "open-devtools" }] : []),
        ],
      },
    ],
    { navigate: (href) => router.push(href as Href) },
  );

  const runDelete = async () => {
    setBusy(true);
    try {
      const result = await deleteAccount();
      if (result.ok) {
        observability?.track("account.deleted");
        // Signed out: the tabs' layout is already on its way to sign-in.
        Alert.alert(t.deletedTitle, t.deletedBody);
        return;
      }
      const buttons = result.signInAgain
        ? [{ text: t.cancel, style: "cancel" as const }, { text: t.signInAgain, onPress: () => void supabase.auth.signOut() }]
        : [{ text: t.ok }];
      Alert.alert(t.deleteFailedTitle, t.deleteErrors[result.reason], buttons);
    } finally {
      setBusy(false);
    }
  };

  // Asks first: deleting the account can't be undone (App Store Review Guideline 5.1.1(v)).
  const confirmDelete = () =>
    Alert.alert(t.deleteConfirmTitle, t.deleteConfirmBody, [
      { text: t.cancel, style: "cancel" },
      { text: t.deleteConfirm, style: "destructive", onPress: () => void runDelete() },
    ]);

  const dangerousActions: SettingsPageDangerousAction[] = [
    {
      label: t.signOut,
      testID: "sign-out",
      onPress: () => {
        observability?.track("auth.signed_out");
        void supabase.auth.signOut();
      },
    },
  ];
  if (starter.features.accountDeletion) {
    dangerousActions.push({ label: t.deleteAccount, testID: "delete-account", emphasized: true, onPress: busy ? () => {} : confirmDelete });
  }
  // Blocks add their rows (push's Notifications row in `general`, support's in `support`); a section left empty is dropped.
  const sections = blockSettings.filter((section) => section.rows.length > 0);
  return (
    <>
      <Stack.Screen options={getSettingsPageStackOptions({ headerTitle: t.title })} />
      <SettingsPage
        testID="settings"
        sections={sections}
        dangerousActions={dangerousActions}
      />
    </>
  );
}
