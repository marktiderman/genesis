import { Redirect } from "expo-router";

/** The app opens on the first section; no sign-in. */
export default function Index() {
  return <Redirect href="/standards" />;
}
