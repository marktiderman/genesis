import { normalizeLink } from "@marktiderman/genesis-native";
import starter from "../../starter.config";
import { linkHold, links } from "@/lib/links";

/** Every incoming link becomes a known app path (unknown ones open `/`), held until the person has signed in. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!starter.features.deepLinks) return "/";
  const to = normalizeLink(path, links);
  if (to && to !== "/") linkHold.hold(to);
  return to;
}
