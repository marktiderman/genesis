import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeListItem,
  NativeListItemDivider,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function ListItemSample() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 0 }}>
        <View className="p-4">
          <NativeText preset="h1">ListItem</NativeText>
        </View>
        <NativeListItem
          testID="list-1"
          title="Notifications"
          subtitle="Push, sound, badge"
          showChevron
          onPress={() => {}}
        />
        <NativeListItemDivider />
        <NativeListItem
          testID="list-2"
          title="Privacy"
          subtitle="Permissions & data"
          showChevron
          onPress={() => {}}
        />
        <NativeListItemDivider />
        <NativeListItem
          testID="list-3"
          title="Disabled item"
          subtitle="Cannot interact"
          showChevron
          onPress={() => {}}
          disabled
        />
      </ScrollView>
    </SafeAreaView>
  );
}
