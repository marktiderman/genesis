import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeRefreshControl,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function RefreshControlSample() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView
        className="flex-1 p-4"
        contentContainerStyle={{ gap: 16 }}
        refreshControl={
          <NativeRefreshControl
            testID="rc"
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
      >
        <NativeText preset="h1">RefreshControl</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Pull down to refresh. Tint resolves from the active brand.
        </NativeText>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} className="rounded-md border border-border bg-card p-4">
            <NativeText preset="body">Item {i + 1}</NativeText>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
