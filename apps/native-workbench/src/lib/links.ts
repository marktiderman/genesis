/**
 * Deep links. The hosts come from `genesis.config.json`'s `links` block, the
 * same block the Expo config plugin turns into associated domains and app
 * links, so the two can't disagree.
 */
import Constants from "expo-constants";
import { createLinkHold, type LinkOptions } from "@marktiderman/genesis-native";
import genesisConfig from "../../genesis.config.json";
import starter from "../../starter.config";
import { linkHosts } from "./link-hosts";

/**
 * The schemes this build answers to. withGenesis gives each APP_VARIANT its own
 * (`genesis-dev://`, `genesis-preview://`, production keeps `genesis://`),
 * so the OS hands a link to the build it names, and only that build. Every variant's is accepted
 * here, plus the one in the served config: a `.dev` binary running against a plain `expo start`
 * (no APP_VARIANT) gets the production config from Metro, but still receives `-dev` links.
 * The suffixes are withGenesis's defaults; change both together.
 */
export const VARIANT_SCHEME_SUFFIXES = ["", "-dev", "-preview"] as const;

export function appSchemes(base: string, built: string | readonly string[] | undefined): string[] {
  const served = built === undefined ? [] : typeof built === "string" ? [built] : built;
  return [...new Set([...VARIANT_SCHEME_SUFFIXES.map((suffix) => base + suffix), ...served])];
}

/** Incoming link paths and the screens they open. `/` is always known; anything else opens `/`. */
export const links: LinkOptions = {
  schemes: appSchemes(starter.app.scheme, Constants.expoConfig?.scheme),
  hosts: linkHosts(genesisConfig),
  // The showcase's sections and their screens (`genesis://components`, `genesis://standards/header-large`).
  map: Object.fromEntries(
    ["standards", "components", "layouts", "messages"].flatMap((section) => [
      [`/${section}`, `/${section}`],
      [`/${section}/:id`, `/${section}/:id`],
    ]),
  ),
};

/** The shell's link hold. The showcase has no sign-in, so nothing is held (+native-intent.ts). */
export const linkHold = createLinkHold();
