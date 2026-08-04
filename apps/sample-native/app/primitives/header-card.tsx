import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeButton,
  NativeCard,
  NativeHeaderCard,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function HeaderCardSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Card — two forms</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Reach for the flat form first. Use HeaderCard only when the
          structured shape recurs.
        </NativeText>

        <NativeText preset="h3">Flat (90% case)</NativeText>
        <NativeCard testID="sample-flat-card" className="p-4">
          <NativeText preset="h3">Profile</NativeText>
          <NativeText preset="body-sm" className="text-muted-foreground">
            Pass any children. No required composition.
          </NativeText>
        </NativeCard>

        <NativeText preset="h3">Structured (10% case)</NativeText>
        <NativeHeaderCard
          testID="sample-header-card"
          title="Edit profile"
          description="Update your account details"
          body={
            <View style={{ gap: 8 }}>
              <NativeText preset="body-sm">Display name: Sample User</NativeText>
              <NativeText preset="body-sm">Email: sample@example.com</NativeText>
            </View>
          }
          footer={
            <>
              <NativeButton variant="ghost">Cancel</NativeButton>
              <NativeButton>Save</NativeButton>
            </>
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}
