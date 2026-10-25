import { Redirect, Stack } from "expo-router";
import { useIdeaBoard } from "@marktiderman/genesis-support/native";
import { InboxPage, getInboxPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../../starter.config";

/** The idea board (`features.support`): suggest an idea, vote once on each, see what's planned. */
export default function IdeaBoardScreen() {
  if (!starter.features.support) return <Redirect href="/settings" />;
  return <Board />;
}

function Board() {
  const { headerTitle, ...board } = useIdeaBoard();
  return (
    <>
      <Stack.Screen options={getInboxPageStackOptions({ headerTitle, large: false })} />
      <InboxPage {...board} />
    </>
  );
}
