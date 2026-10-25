/**
 * The sites block, as a `defineBlock` declaration: what `genesis add sites`
 * installs (the migration and its pgTAP test) and what it means for the
 * stores' privacy forms. Node-safe: no React, no Supabase client.
 */
import { defineBlock } from "@marktiderman/genesis-features/blocks";

const PACKAGE = "@marktiderman/genesis-sites";

/**
 * Sites and landing pages: the `genesis_sites` schema (sites, pages,
 * releases, assets), drafts, publish and rollback. The pages are served by
 * `handleSiteRequest` from `@marktiderman/genesis-sites/web`, mounted by the
 * app on its own server.
 *
 * @stability Beta
 */
export const sitesBlock = defineBlock({
  id: "sites",
  platforms: ["web", "server"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0001_genesis_sites.sql", test: "migrations/tests/0001_genesis_sites.test.sql" }],
    privacy: {
      notes: [
        "Sites hold what their editors write and publish; a published site is public.",
        "Each release records who published it; a deleted person's releases stay, without the person.",
        "Visitors' form answers go to the app's own forms endpoint, not to the site tables.",
      ],
    },
  },
});
