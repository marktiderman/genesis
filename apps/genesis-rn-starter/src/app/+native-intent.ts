import { normalizeLink } from "@marktiderman/genesis-native";
import { PREVIEW_PATH } from "@marktiderman/genesis-native/updates";
import starter from "../../starter.config";
import { linkHold, links } from "@/lib/links";

/** The preview route itself (`/preview`, `/preview?…`, `/preview/…`), never `/previews` or `/preview-settings`. */
function isPreviewPath(to: string): boolean {
  return to === PREVIEW_PATH || to.startsWith(`${PREVIEW_PATH}?`) || to.startsWith(`${PREVIEW_PATH}/`);
}

/** Every incoming link becomes a known app path (unknown ones open `/`), held until the person has signed in. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!starter.features.deepLinks) return "/";
  const to = normalizeLink(path, links);
  // A preview link opens at once, signed in or not: it changes the app's code, not the person's data.
  if (to && to !== "/" && !isPreviewPath(to)) linkHold.hold(to);
  return to;
}
