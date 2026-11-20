/**
 * The blocks this package carries the server half of, as `defineBlock`
 * declarations: what each needs in the database, and what it means for the
 * stores' privacy forms. The functions themselves (`deleteMyAccount`,
 * `tenantFeatures`, …) don't change.
 */
import { defineBlock } from "@marktiderman/genesis-config/blocks";

const PACKAGE = "@marktiderman/genesis-supabase";

/**
 * The account block: sign-in, profile and in-app account deletion. Its
 * screens are the app's (or genesis-ui-native's `AuthScreen`); this names its
 * migrations and its data.
 *
 * @stability Beta
 */
export const accountBlock = defineBlock({
  id: "account",
  platforms: ["web", "native"],
  contributes: {
    migrations: [
      {
        package: PACKAGE,
        file: "migrations/0001_genesis_account_deletion.sql",
        test: "migrations/tests/0001_genesis_account_deletion.test.sql",
      },
      // With Sign in with Apple, with the genesis-apple-revoke function beside it.
      {
        package: PACKAGE,
        file: "migrations/0003_genesis_apple_token_revocation.sql",
        test: "migrations/tests/0003_genesis_apple_token_revocation.test.sql",
      },
    ],
    privacy: {
      collects: [
        {
          type: "email address",
          purposes: ["app functionality"],
          linked: true,
          tracking: false,
        },
        {
          type: "user id",
          purposes: ["app functionality"],
          linked: true,
          tracking: false,
        },
        {
          type: "name",
          purposes: ["app functionality"],
          linked: true,
          tracking: false,
        },
      ],
      notes: [
        "People delete their account from inside the app; their login and the rows that cascade from it go with it.",
        "With Sign in with Apple, the person's Apple tokens are revoked when the account is deleted.",
      ],
    },
  },
});

/**
 * The tenant features block: per-tenant on/off switches for shipped
 * features, set by the tenant's admins with a reason.
 *
 * @stability Beta
 */
export const tenantFeaturesBlock = defineBlock({
  id: "tenant-features",
  contributes: {
    migrations: [
      {
        package: PACKAGE,
        file: "migrations/0004_genesis_tenant_features.sql",
        test: "migrations/tests/0004_genesis_tenant_features.test.sql",
      },
    ],
    privacy: {
      notes: [
        "Keeps who changed a tenant's switches; a deleted person's changes stay, without the person.",
      ],
    },
  },
});

/**
 * The feature registry block: the registry mirrored into the app's database
 * on deploy, entitlements, per-tenant and platform flag values and SQL `feature_on()`,
 * for the feature gate. Needs the tenant features block.
 *
 * @stability Beta
 */
export const featureMirrorBlock = defineBlock({
  id: "feature-mirror",
  requires: ["tenant-features"],
  contributes: {
    migrations: [
      {
        package: PACKAGE,
        file: "migrations/0008_genesis_feature_registry.sql",
        test: "migrations/tests/0008_genesis_feature_registry.test.sql",
      },
      {
        package: PACKAGE,
        file: "migrations/0014_genesis_feature_registry_hardening.sql",
        test: "migrations/tests/0014_genesis_feature_registry_hardening.test.sql",
      },
      { package: PACKAGE, file: "migrations/0016_genesis_viewer_people.sql", test: "migrations/tests/0016_genesis_viewer_people.test.sql" },
      {
        package: PACKAGE,
        file: "migrations/0017_genesis_person_entitlements.sql",
        test: "migrations/tests/0017_genesis_person_entitlements.test.sql",
      },
    ],
    privacy: {
      notes: [
        "Stores which tenants and which people (the app's person ids) hold which paid features, and flag values.",
      ],
    },
  },
});

/**
 * The settings block: the database layer of Genesis settings (genesis-config's
 * `resolveSettings`), its history and the app manifest, with platform admins
 * changing runtime settings through `set_genesis_setting`.
 *
 * @stability Beta
 */
export const settingsBlock = defineBlock({
  id: "settings",
  platforms: ["web", "native"],
  contributes: {
    migrations: [
      { package: PACKAGE, file: "migrations/0020_genesis_settings.sql", test: "migrations/tests/0020_genesis_settings.test.sql" },
      // Whole numbers: a fraction is refused for a key declared `integer`.
      { package: PACKAGE, file: "migrations/0021_genesis_settings_integer.sql", test: "migrations/tests/0021_genesis_settings_integer.test.sql" },
      // A default platform-admin list, so an app with no SQL of its own can have an admin.
      { package: PACKAGE, file: "migrations/0022_genesis_platform_admins.sql", test: "migrations/tests/0022_genesis_platform_admins.test.sql" },
      // The tenant and person layers, and Realtime refresh.
      { package: PACKAGE, file: "migrations/0023_genesis_settings_tenant_person.sql", test: "migrations/tests/0023_genesis_settings_tenant_person.test.sql" },
    ],
    privacy: {
      notes: ["Keeps who changed an app setting, when and from what to what; a deleted person's changes stay, without the person. No setting holds a secret."],
    },
  },
});

/**
 * The jobs block: a background-job queue and named schedules that call the
 * app's job route. Server only; the route is `createJobsHandler` from `/jobs`.
 *
 * @stability Beta
 */
export const jobsBlock = defineBlock({
  id: "jobs",
  platforms: ["web"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0007_genesis_jobs.sql", test: "migrations/tests/0007_genesis_jobs.test.sql" }],
    privacy: { notes: ["Job payloads hold ids, never content or secrets; finished jobs are deleted after 14 days."] },
  },
});

/**
 * The web handoff block: continue on the web, already signed in. The routes are
 * `createWebHandoff` from `/web-handoff/server`, the page uses `/web-handoff`, and the native
 * app calls `openOnWeb` from genesis-native.
 *
 * @stability Beta
 */
export const webHandoffBlock = defineBlock({
  id: "web-handoff",
  platforms: ["web", "native"],
  contributes: {
    migrations: [
      { package: PACKAGE, file: "migrations/0015_genesis_web_handoff.sql", test: "migrations/tests/0015_genesis_web_handoff.test.sql" },
    ],
    privacy: {
      notes: [
        "Logs each handoff (who, which page, when) for 30 days; keeps a SHA-256 digest of each link's token, never the token or a sign-in token.",
      ],
    },
  },
});


/**
 * The product events block: the app's own events table and its tracking functions (ADR 0010).
 * The client is `createEventTracker` from `/events`; on native, `createEventsSink` plugs it into the
 * observability sinks.
 *
 * @stability Beta
 */
export const eventsBlock = defineBlock({
  id: "events",
  platforms: ["web", "native"],
  contributes: {
    migrations: [{ package: PACKAGE, file: "migrations/0018_genesis_events.sql", test: "migrations/tests/0018_genesis_events.test.sql" }],
    privacy: {
      notes: [
        "Stores product events: the login, the person record and tenant, the feature, an event name, small properties (labels and counts, never typed content or personal data), the flags that were on, the platform and the time. Only the service role reads them; delete old ones with genesis_prune_events (default 400 days).",
      ],
    },
  },
});

/**
 * The versioned-writes block: `genesis_version_bump`, the trigger that advances a row's version on
 * every update, so the Supabase data provider's `version` rule can refuse an edit made on a stale
 * copy as a `conflict`.
 *
 * @stability Beta
 */
export const versionedWritesBlock = defineBlock({
  id: "versioned-writes",
  platforms: ["web", "native"],
  contributes: {
    migrations: [
      { package: PACKAGE, file: "migrations/0019_genesis_version_bump.sql", test: "migrations/tests/0019_genesis_version_bump.test.sql" },
    ],
  },
});
