/**
 * The web hosts whose links open in the app: genesis.config.json's `links.hosts`. An app with no
 * domain yet has no `links` block: remove the whole block, since the Expo config plugin rejects
 * one with an empty `hosts` list. It then has no app links and only its schemes open it. Kept
 * free of React Native imports so the tests can read it.
 */
export type LinkHostsConfig = { readonly links?: { readonly hosts?: readonly string[] } | null; readonly [key: string]: unknown };

/** Takes the whole genesis.config.json, so a config with other keys and no `links` still typechecks. */
export function linkHosts(config: LinkHostsConfig): string[] {
  return [...(config.links?.hosts ?? [])];
}
