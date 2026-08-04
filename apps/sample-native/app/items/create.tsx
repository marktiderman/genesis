import { useRouter, Stack } from "expo-router";
import { NativeResourceForm } from "@marktiderman/genesis-ui-native/data";
import { itemFields } from "../lib/data";

export default function CreateItemScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "New Item", headerShown: true }} />
      <NativeResourceForm
        resource="items"
        action="create"
        fields={itemFields}
        onSuccess={() => router.back()}
      />
    </>
  );
}
