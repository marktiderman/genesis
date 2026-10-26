/**
 * The registry's plain types, with no zod: shared by the model and the zod-free
 * gate so `/gate` never pulls zod in, even in its type declarations.
 */

/**
 * Where a feature is in its life. The order is the board's column order.
 * `idea` is captured but not agreed: it is in the list so `find` turns it up
 * before someone builds the same thing twice.
 *
 * @stability Beta
 */
export const FEATURE_STATUSES = ["idea", "planned", "building", "beta", "live", "deprecated", "retired"] as const;

/** @stability Beta */
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

/**
 * Who gets a feature: everyone, or one paid plan. The feature id doubles as
 * the billing entitlement's lookup key (a Stripe `lookup_key`).
 *
 * @stability Beta
 */
export type FeatureAccess = "all" | { plan: string };

/**
 * Why a flag exists. `release` and `experiment` flags need `expires`, `ops`
 * flags need a `runbook`, and `permission` flags fail `check`: paid access
 * belongs in entitlements (`access`), not flags.
 *
 * @stability Beta
 */
export const FLAG_KINDS = ["release", "experiment", "ops", "permission"] as const;

/** @stability Beta */
export type FlagKind = (typeof FLAG_KINDS)[number];

/** A flag's default: anything an OpenFeature flag can hold. */
export type FlagValue = boolean | string | number | { readonly [key: string]: unknown };

