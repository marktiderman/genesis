import { normalizeLink } from "@marktiderman/genesis-native";
import { PREVIEW_PATH } from "@marktiderman/genesis-native/updates";
import starter from "../../starter.config";
import { linkHold, links } from "@/lib/links";

/** Every incoming link becomes a known app path (unknown ones open `/`), held until the person has signed in. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!starter.features.deepLinks) return "/";
  const to = normalizeLink(path, links);
  // A preview link opens at once, signed in or not: it changes the app's code, not the person's data.
  if (to && to !== "/" && !to.startsWith(PREVIEW_PATH)) linkHold.hold(to);
  return to;
}
