import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeText,
  NativeToastProvider,
  useToast,
} from "@marktiderman/genesis-ui-native";

function ToastDemo() {
  const toast = useToast();
  return (
    <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 12 }}>
      <NativeText preset="h1">Toast</NativeText>
      <NativeText preset="body" className="text-muted-foreground">
        Tap any toast to dismiss it early. Toasts queue.
      </NativeText>
      <NativeButton
        testID="toast-default"
        onPress={() => toast.show({ title: "Saved", description: "All good." })}
      >
        Show default
      </NativeButton>
      <NativeButton
        testID="toast-success"
        variant="secondary"
        onPress={() =>
          toast.show({ title: "Synced", variant: "success", duration: 2500 })
        }
      >
        Show success
      </NativeButton>
      <NativeButton
        testID="toast-destructive"
        variant="destructive"
        onPress={() =>
          toast.show({
            title: "Failed to sync",
            description: "Tap to dismiss.",
            variant: "destructive",
          })
        }
      >
        Show destructive
      </NativeButton>
    </ScrollView>
  );
}

export default function ToastSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <NativeToastProvider>
        <ToastDemo />
      </NativeToastProvider>
    </SafeAreaView>
  );
}
