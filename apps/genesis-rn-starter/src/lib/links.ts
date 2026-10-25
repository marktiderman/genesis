/**
 * Deep links. The hosts come from `genesis.config.json`'s `links` block, the
 * same block the Expo config plugin turns into associated domains and app
 * links, so the two can't disagree.
 */
import Constants from "expo-constants";
import { createLinkHold, type LinkOptions } from "@marktiderman/genesis-native";
import genesisConfig from "../../genesis.config.json";
import starter from "../../starter.config";

/**
 * The schemes this build answers to: `starter.app.scheme`, and the one the build registered.
 * withGenesis gives each APP_VARIANT its own (`genesis-starter-dev://`, `genesis-starter-preview://`,
 * production keeps `genesis-starter://`), so a link opens the build it names.
 */
export function appSchemes(base: string, built: string | readonly string[] | undefined): string[] {
  return [...new Set([base, ...(built === undefined ? [] : typeof built === "string" ? [built] : built)])];
}

/** Incoming link paths and the screens they open. `/` is always known; anything else opens `/`. */
export const links: LinkOptions = {
  schemes: appSchemes(starter.app.scheme, Constants.expoConfig?.scheme),
  hosts: genesisConfig.links.hosts,
  map: {
    ...(starter.features.notifications ? { "/notifications": "/notifications" } : {}),
    // The check-in example's link (`genesis-starter://check-in?gym=hilltop` fills in the gym; `genesis-starter-dev://` in a development build).
    ...(starter.features.checkIn ? { "/check-in": "/check-in" } : {}),
    "/settings": "/settings",
    ...(starter.features.push ? { "/settings/notifications": "/settings/notifications" } : {}),
  },
};

/** A link that arrives while signed out, followed once the person signs in. */
export const linkHold = createLinkHold();
