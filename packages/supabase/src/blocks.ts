/**
 * The blocks this package carries the server half of, as `defineBlock`
 * declarations: what each needs in the database, and what it means for the
 * stores' privacy forms. The functions themselves (`deleteMyAccount`,
 * `tenantFeatures`, …) don't change.
 */
import { defineBlock } from "@marktiderman/genesis-features/blocks";

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
 * on deploy, entitlements, per-tenant flag values and SQL `feature_on()`,
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
    ],
    privacy: {
      notes: [
        "Stores which tenants hold which paid features and flag values; no personal data.",
      ],
    },
  },
});
