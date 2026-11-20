/**
 * Every support screen (`features.support`) from the two one-line route files under
 * `src/app/(app)/settings/support/` (`index.tsx` and `[...route].tsx`): genesis-support's
 * `SupportRoute` reads the path and renders the inbox, a report's thread, the idea board,
 * "you asked, we shipped", Help and the agent desk. Two things are the starter's own: with
 * support off, the route sends you back to Settings, and Send feedback closes with a toast.
 */
import { Redirect, Stack, router } from "expo-router";
import { FeedbackForm, SupportRoute } from "@marktiderman/genesis-support/native";
import { SettingsSubPage, getSettingsSubPageStackOptions, useToast } from "@marktiderman/genesis-ui-native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { supportBasePath } from "./support";

export function StarterSupportRoute() {
  if (!starter.features.support) return <Redirect href="/settings" />;
  return <SupportRoute screens={{ feedback: SendFeedbackScreen }} />;
}

/** Send feedback: once it's sent, a toast says so (GenesisNativeApp mounts the toast provider) and the screen closes. */
function SendFeedbackScreen() {
  const toast = useToast();
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
            else router.replace(supportBasePath);
          }}
        />
      </SettingsSubPage>
    </>
  );
}
