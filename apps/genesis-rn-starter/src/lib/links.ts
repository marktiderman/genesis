/**
 * Deep links. The hosts come from `genesis.config.json`'s `links` block, the
 * same block the Expo config plugin turns into associated domains and app
 * links, so the two can't disagree.
 */
import { createLinkHold, type LinkOptions } from "@marktiderman/genesis-native";
import genesisConfig from "../../genesis.config.json";
import starter from "../../starter.config";

/** Incoming link paths and the screens they open. `/` is always known; anything else opens `/`. */
export const links: LinkOptions = {
  schemes: [starter.app.scheme],
  hosts: genesisConfig.links.hosts,
  map: {
    ...(starter.features.notifications ? { "/notifications": "/notifications" } : {}),
    // The check-in example's link (`genesis-starter://check-in?gym=hilltop` fills in the gym).
    ...(starter.features.checkIn ? { "/check-in": "/check-in" } : {}),
    "/settings": "/settings",
    ...(starter.features.push ? { "/settings/notifications": "/settings/notifications" } : {}),
  },
};

/** A link that arrives while signed out, followed once the person signs in. */
export const linkHold = createLinkHold();
