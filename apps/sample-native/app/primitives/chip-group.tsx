import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeChip,
  NativeChipGroup,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function ChipGroupSample() {
  const [tags, setTags] = useState<string | string[]>(["new"]);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">ChipGroup</NativeText>
        <NativeText preset="label">Multiple</NativeText>
        <NativeChipGroup
          testID="tag-chips"
          mode="multiple"
          value={tags}
          onChange={(v) => setTags(v)}
        >
          <NativeChip value="new">New</NativeChip>
          <NativeChip value="popular">Popular</NativeChip>
          <NativeChip value="discounted">Discounted</NativeChip>
          <NativeChip value="local">Local</NativeChip>
        </NativeChipGroup>
        <NativeText preset="body-sm">
          Selected: {Array.isArray(tags) ? tags.join(", ") || "(none)" : tags}
        </NativeText>
      </ScrollView>
    </SafeAreaView>
  );
}
