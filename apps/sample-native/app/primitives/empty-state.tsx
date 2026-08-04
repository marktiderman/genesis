import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeEmptyState,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function EmptyStateSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 24 }}>
        <NativeText preset="h1">EmptyState</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Three canonical variants. Pass either an `icon` or `illustration`
          slot, plus a `primaryAction` and optional `secondaryAction`.
        </NativeText>

        <NativeEmptyState
          testID="empty-first-run"
          variant="first-run"
          illustration={
            <View className="h-24 w-24 items-center justify-center rounded-full bg-muted">
              <NativeText preset="h2">+</NativeText>
            </View>
          }
          title="Welcome to your library"
          body="Save quotes, prayers, and notes here as you work."
          primaryAction={
            <NativeButton testID="empty-add">Add your first entry</NativeButton>
          }
        />

        <NativeEmptyState
          testID="empty-no-results"
          variant="no-results"
          icon={
            <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
              <NativeText preset="body-sm">?</NativeText>
            </View>
          }
          title="No matches"
          body="Try a different search term or clear filters."
          secondaryAction={
            <NativeButton testID="empty-reset" variant="ghost">
              Clear filters
            </NativeButton>
          }
        />

        <NativeEmptyState
          testID="empty-error"
          variant="error"
          title="Couldn't load entries"
          body="Check your connection and try again."
          primaryAction={
            <NativeButton testID="empty-retry" variant="outline">
              Retry
            </NativeButton>
          }
          details="net::ERR_INTERNET_DISCONNECTED"
        />
      </ScrollView>
    </SafeAreaView>
  );
}
