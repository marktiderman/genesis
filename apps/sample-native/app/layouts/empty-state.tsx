import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeCard,
  NativeCardContent,
  NativeCardHeader,
  NativeCardTitle,
  NativeEmptyState,
  NativeText,
} from "@marktiderman/genesis-ui-native";

/**
 * E6 sample — exercises every variant of the EmptyState primitive
 * extended in this PR (first-run / no-results / error) plus the slot
 * APIs (illustration, icon, primaryAction, secondaryAction, details).
 *
 * Each card renders a different real-world scenario so consumers can
 * see how the same primitive composes for their use case.
 */
export default function EmptyStateLayoutSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4 gap-4" testID="empty-state-sample">
        <NativeText preset="h1">EmptyState (E6)</NativeText>
        <NativeText preset="body-sm" className="text-muted-foreground">
          Three semantic variants drive default messaging. Pass your own
          content via the action / icon / illustration slots to override.
        </NativeText>

        <NativeCard>
          <NativeCardHeader>
            <NativeCardTitle>Variant: first-run</NativeCardTitle>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeEmptyState
              variant="first-run"
              title="Welcome to your inbox"
              body="When you get a message, it'll show up here."
              primaryAction={
                <NativeButton testID="empty-first-run-cta" onPress={() => {}}>
                  Compose first message
                </NativeButton>
              }
              testID="empty-first-run"
            />
          </NativeCardContent>
        </NativeCard>

        <NativeCard>
          <NativeCardHeader>
            <NativeCardTitle>Variant: no-results</NativeCardTitle>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeEmptyState
              variant="no-results"
              title="No matches"
              body='Try a different keyword or clear your filters.'
              primaryAction={
                <NativeButton
                  testID="empty-no-results-cta"
                  variant="outline"
                  onPress={() => {}}
                >
                  Clear filters
                </NativeButton>
              }
              testID="empty-no-results"
            />
          </NativeCardContent>
        </NativeCard>

        <NativeCard>
          <NativeCardHeader>
            <NativeCardTitle>Variant: error</NativeCardTitle>
          </NativeCardHeader>
          <NativeCardContent>
            <NativeEmptyState
              variant="error"
              body="We couldn't load this list. Check your connection and try again."
              primaryAction={
                <NativeButton testID="empty-error-cta" onPress={() => {}}>
                  Retry
                </NativeButton>
              }
              secondaryAction={
                <NativeButton
                  testID="empty-error-secondary"
                  variant="ghost"
                  onPress={() => {}}
                >
                  Contact support
                </NativeButton>
              }
              details="ERR_NETWORK · request_id 9c8e7b — visible in __DEV__ only"
              testID="empty-error"
            />
          </NativeCardContent>
        </NativeCard>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
