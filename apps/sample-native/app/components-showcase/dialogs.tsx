import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeText,
  NativeButton,
  NativeDialog,
  NativeDialogContent,
  NativeDialogHeader,
  NativeDialogTitle,
  NativeDialogDescription,
  NativeDialogFooter,
} from "@marktiderman/genesis-ui-native";

/**
 * Showcase: NativeDialog — open/closed states for snapshot capture.
 * Maestro flow opens the dialog by tapping `dialog-open-trigger`.
 */
export default function DialogsShowcase() {
  const [open, setOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView contentContainerClassName="p-4" testID="showcase-dialogs">
        <View style={{ gap: 16 }}>
          <NativeText preset="h2">Dialogs</NativeText>
          <NativeText preset="body-sm">
            Modal blocking surface for confirmations or short flows. Press
            &ldquo;Open dialog&rdquo; to capture the open state for Maestro.
          </NativeText>
          <NativeText preset="caption" className="text-muted-foreground">
            @stability stable
          </NativeText>

          <NativeButton
            variant="default"
            onPress={() => setOpen(true)}
            testID="dialog-open-trigger"
          >
            Open dialog
          </NativeButton>
        </View>
      </ScrollView>

      <NativeDialog open={open} onOpenChange={setOpen}>
        <NativeDialogContent testID="dialog-content">
          <NativeDialogHeader>
            <NativeDialogTitle>Confirm action</NativeDialogTitle>
            <NativeDialogDescription>
              This is a stable description for visual regression.
            </NativeDialogDescription>
          </NativeDialogHeader>
          <NativeDialogFooter>
            <NativeButton
              variant="outline"
              size="sm"
              onPress={() => setOpen(false)}
              testID="dialog-cancel"
            >
              Cancel
            </NativeButton>
            <NativeButton
              variant="default"
              size="sm"
              onPress={() => setOpen(false)}
              testID="dialog-confirm"
            >
              Confirm
            </NativeButton>
          </NativeDialogFooter>
        </NativeDialogContent>
      </NativeDialog>
    </SafeAreaView>
  );
}
