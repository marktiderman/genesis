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
  map: { "/notifications": "/notifications", "/settings": "/settings" },
};

/** A link that arrives while signed out, followed once the person signs in. */
export const linkHold = createLinkHold();
