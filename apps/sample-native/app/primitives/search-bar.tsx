import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativeSearchBar,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function SearchBarSample() {
  const [q, setQ] = useState("");
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">SearchBar</NativeText>
        <NativeSearchBar
          testID="results-search"
          value={q}
          onChange={setQ}
          onSubmit={(value) => console.log("search:", value)}
          onVoicePress={() => console.log("voice")}
        />
        <NativeText preset="body-sm">Query: {q || "(empty)"}</NativeText>
      </ScrollView>
    </SafeAreaView>
  );
}
