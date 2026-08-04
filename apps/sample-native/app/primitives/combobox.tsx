import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeCombobox,
  NativeText,
} from "@marktiderman/genesis-ui-native";

const fruits = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana", description: "Yellow tropical" },
  { value: "cherry", label: "Cherry" },
  { value: "date", label: "Date" },
  { value: "elderberry", label: "Elderberry" },
];

export default function ComboboxSample() {
  const [value, setValue] = useState<string | undefined>();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Combobox</NativeText>
        <NativeText preset="body" className="text-muted-foreground">
          Type to filter. Tap an option to select.
        </NativeText>
        <NativeCombobox<string>
          testID="combobox-fruits"
          options={fruits}
          value={value}
          onChange={setValue}
          placeholder="Pick a fruit"
        />
        <NativeText preset="body-sm">
          Selected: <NativeText preset="label">{value ?? "(none)"}</NativeText>
        </NativeText>
      </ScrollView>
    </SafeAreaView>
  );
}
