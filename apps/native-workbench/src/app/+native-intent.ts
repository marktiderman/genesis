import { normalizeLink } from "@marktiderman/genesis-native";
import starter from "../../starter.config";
import { links } from "@/lib/links";

/** Every incoming link becomes a known app path (unknown ones open `/`). The showcase has no sign-in, so a link opens at once: nothing is held. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!starter.features.deepLinks) return "/";
  return normalizeLink(path, links);
}
