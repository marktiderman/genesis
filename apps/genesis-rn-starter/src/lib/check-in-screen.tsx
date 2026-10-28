import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { useSession } from "@marktiderman/genesis-native";
import { FormFocus, Button } from "@marktiderman/genesis-forms-native";
import { useFormDraft } from "@marktiderman/genesis-forms-react";
import { ScreenContainer } from "@marktiderman/genesis-ui-native";
import starter from "../../starter.config";
import { copy } from "@/copy";
import { checkInDrafts, checkInForm, checkInHaptics, checkInHostOptions, checkInKey, checkInOutbox, checkInPhotos } from "@/lib/check-in";

/**
 * The check-in example (`features.checkIn`): one question per screen, the title in the native
 * header, a draft per signed-in user and the offline outbox. Open it with a link to fill in the
 * location: `genesis-starter://check-in?location=hilltop`. The Home tab shows it at `/check-in`; a check-in
 * card in a conversation opens it in the Messages stack (`/messages/check-in`), so Back returns
 * to the conversation. `backTitle` names the screen under it (left out, iOS uses that screen's title).
 */
export function CheckInScreen({ backTitle }: { backTitle?: string }) {
  const params = useLocalSearchParams<{ location?: string }>();
  const { session } = useSession<Session>();
  const draft = useFormDraft(checkInForm, {
    store: checkInDrafts,
    respondent: session?.user.id ?? "signed-out",
    hostOptions: checkInHostOptions,
    linkParams: params.location ? { location: params.location } : undefined,
  });
  if (!starter.features.checkIn) return <Redirect href="/" />;
  return (
    <ScreenContainer testID="check-in">
      <FormFocus
        draft={draft}
        outbox={checkInOutbox}
        createKey={checkInKey}
        haptics={checkInHaptics}
        photos={checkInPhotos}
        screen={Stack.Screen}
        headerOptions={{ headerBackTitle: backTitle }}
        testID="check-in-form"
        slotProps={{ ending: { actions: <Button onPress={() => router.back()} testID="check-in-done">{copy.checkIn.done}</Button> } }}
      />
    </ScreenContainer>
  );
}
