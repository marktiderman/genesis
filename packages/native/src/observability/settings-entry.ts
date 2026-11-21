/**
 * `@marktiderman/genesis-native/observability-settings`: error reporting's settings
 * (`observability.enabled`, `.sentryDsn`, `.sentryOrg`) and the DSN helpers, with no React or React
 * Native, so a web app or a server can put them in its settings catalogue (genesis-config's
 * `settingsCatalogue`, the synced catalogue) beside its own. The same names are exported from
 * `/observability`.
 *
 * @stability Beta
 */
export {
  OBSERVABILITY_SETTING_SPECS,
  observabilitySettings,
  observabilitySettingValues,
  parseSentryDsn,
  resolveSentryDsn,
  SENTRY_DSN_PATTERN,
  SENTRY_ORG_PATTERN,
  sentryDsnProblem,
  type ObservabilitySettingsInput,
  type ObservabilitySettingValues,
  type ResolvedSentryDsn,
  type SentryDsnParts,
  type SentryDsnSource,
} from "./settings";
