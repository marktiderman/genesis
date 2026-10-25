import { Redirect, Stack } from "expo-router";
import { useShippedIdeas } from "@marktiderman/genesis-support/native";
import { InboxPage, getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";

/** You asked, we shipped (`features.support`): ideas you suggested or voted for that shipped, with the feature each shipped as. */
export default function ShippedIdeasScreen() {
  if (!starter.features.support) return <Redirect href="/settings" />;
  return <Shipped />;
}

function Shipped() {
  const { headerTitle, ...shipped } = useShippedIdeas();
  return (
    <>
      <Stack.Screen options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...shipped} />
    </>
  );
}
