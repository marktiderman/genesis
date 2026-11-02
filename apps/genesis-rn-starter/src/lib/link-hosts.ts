/**
 * The web hosts whose links open in the app: genesis.config.json's `links.hosts`. An app with no
 * domain yet has no `links` block (or no hosts in it), so it has no app links and only its
 * schemes open it. Kept free of React Native imports so the tests can read it.
 */
export function linkHosts(config: { links?: { hosts?: readonly string[] } | null }): string[] {
  return [...(config.links?.hosts ?? [])];
}
