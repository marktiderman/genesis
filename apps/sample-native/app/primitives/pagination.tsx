import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  NativePagination,
  NativeText,
} from "@marktiderman/genesis-ui-native";

export default function PaginationSample() {
  const [page, setPage] = useState(0);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["left", "right"]}>
      <ScrollView className="flex-1 p-4" contentContainerStyle={{ gap: 16 }}>
        <NativeText preset="h1">Pagination</NativeText>
        <NativePagination
          testID="results-pagination"
          pageCount={12}
          page={page}
          onChange={setPage}
        />
        <NativeText preset="body-sm">Page: {page + 1}</NativeText>
      </ScrollView>
    </SafeAreaView>
  );
}
