import { Redirect, Stack, router } from "expo-router";
import { FeedbackForm } from "@marktiderman/genesis-support/native";
import { SettingsSubPage, getSettingsSubPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";
import { copy } from "@/copy";

/** Send feedback (`features.support`): type, message and the screenshot a shake captured, marked up if you like. */
export default function SendFeedbackScreen() {
  if (!starter.features.support) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={getSettingsSubPageStackOptions({ headerTitle: copy.support.feedback.title })} />
      <SettingsSubPage testID="support-feedback" onConfirmLeave={null}>
        <FeedbackForm onSent={() => (router.canGoBack() ? router.back() : router.replace("/settings/support"))} />
      </SettingsSubPage>
    </>
  );
}
