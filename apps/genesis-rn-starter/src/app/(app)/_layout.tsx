import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useSession } from "@marktiderman/genesis-native";
import starter from "../../../starter.config";
import { copy } from "@/copy";

/** Signed-in screens: the platform's own tab bar. A tab whose feature is off is hidden. */
export default function AppLayout() {
  const { status } = useSession();
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>{copy.tabs.home}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications" hidden={!starter.features.notifications}>
        <NativeTabs.Trigger.Label>{copy.tabs.notifications}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{copy.tabs.settings}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
