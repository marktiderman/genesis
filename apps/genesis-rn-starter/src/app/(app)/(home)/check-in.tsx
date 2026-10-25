import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSession } from "@marktiderman/genesis-native";
import { FormFocus, Button } from "@marktiderman/genesis-forms-native";
import { useFormDraft } from "@marktiderman/genesis-forms-react";
import { ScreenContainer } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";
import { checkInDrafts, checkInForm, checkInHaptics, checkInHostOptions, checkInKey, checkInOutbox } from "@/lib/check-in";

/**
 * The check-in example (`features.checkIn`): one question per screen, the title in the native
 * header, a draft per signed-in user and the offline outbox. Open it with a link to fill in the
 * gym: `genesis-starter://check-in?gym=hilltop`.
 */
export default function CheckInScreen() {
  const params = useLocalSearchParams<{ gym?: string }>();
  const { session } = useSession<Session>();
  const draft = useFormDraft(checkInForm, {
    store: checkInDrafts,
    respondent: session?.user.id ?? "signed-out",
    hostOptions: checkInHostOptions,
    linkParams: params.gym ? { gym: params.gym } : undefined,
  });
  if (!starter.features.checkIn) return <Redirect href="/" />;
  return (
    <ScreenContainer testID="check-in">
      <FormFocus
        draft={draft}
        outbox={checkInOutbox}
        createKey={checkInKey}
        haptics={checkInHaptics}
        screen={Stack.Screen}
        headerOptions={{ headerBackTitle: copy.home.title }}
        testID="check-in-form"
        slotProps={{ ending: { actions: <Button onPress={() => router.back()} testID="check-in-done">{copy.checkIn.done}</Button> } }}
      />
    </ScreenContainer>
  );
}
