import Constants from "expo-constants";
import { Stack } from "expo-router";
import { Alert } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { deleteMyAccount } from "@marktiderman/genesis-supabase";
import { useSession } from "@marktiderman/genesis-native";
import { SettingsPage, getSettingsPageStackOptions, type SettingsPageDangerousAction } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { supabase } from "@/lib/supabase";

const t = copy.settings;

/** Asks first: deleting the account can't be undone (App Store Review Guideline 5.1.1(v)). */
function confirmDeleteAccount() {
  Alert.alert(t.deleteConfirmTitle, t.deleteConfirmBody, [
    { text: t.cancel, style: "cancel" },
    {
      text: t.deleteConfirm,
      style: "destructive",
      // On success the session ends and the tabs' layout sends them to sign-in.
      onPress: () => void deleteMyAccount(supabase).catch(() => Alert.alert(t.deleteFailedTitle, t.deleteFailedBody)),
    },
  ]);
}

/** The Settings tab: who is signed in, the app version, sign out and (`features.accountDeletion`) delete account. */
export default function SettingsScreen() {
  const { session } = useSession<Session>();
  const dangerousActions: SettingsPageDangerousAction[] = [
    { label: t.signOut, testID: "sign-out", onPress: () => void supabase.auth.signOut() },
  ];
  if (starter.features.accountDeletion) {
    dangerousActions.push({ label: t.deleteAccount, testID: "delete-account", emphasized: true, onPress: confirmDeleteAccount });
  }
  return (
    <>
      <Stack.Screen options={getSettingsPageStackOptions({ headerTitle: t.title })} />
      <SettingsPage
        testID="settings"
        sections={[
          { id: "account", title: t.accountSection, rows: [{ id: "email", title: t.signedInAs, subtitle: session?.user.email ?? "" }] },
          { id: "about", title: t.aboutSection, rows: [{ id: "version", title: t.version, subtitle: Constants.expoConfig?.version ?? "" }] },
        ]}
        dangerousActions={dangerousActions}
      />
    </>
  );
}
