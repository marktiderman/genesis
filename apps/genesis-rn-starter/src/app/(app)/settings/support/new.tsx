import { Redirect, Stack, router } from "expo-router";
import { FeedbackForm } from "@marktiderman/genesis-support/native";
import { SettingsSubPage, getSettingsSubPageStackOptions, useToast } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";
import { copy } from "@/copy";

/**
 * Send feedback (`features.support`): type, message and the screenshot a shake captured, marked up
 * if you like. Once it's sent, a toast says so (GenesisNativeApp mounts the toast provider) and the
 * screen closes.
 */
export default function SendFeedbackScreen() {
  const toast = useToast();
  if (!starter.features.support) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={getSettingsSubPageStackOptions({ headerTitle: copy.support.feedback.title })} />
      <SettingsSubPage testID="support-feedback" onConfirmLeave={null}>
        <FeedbackForm
          sentAlert={false}
          onSent={(delivery) => {
            toast.show({
              title: copy.toasts.feedbackSent,
              description: delivery.attachmentsDropped ? copy.toasts.feedbackSentWithoutScreenshot : undefined,
              variant: "success",
              testID: "feedback-sent-toast",
            });
            if (router.canGoBack()) router.back();
            else router.replace("/settings/support");
          }}
        />
      </SettingsSubPage>
    </>
  );
}
