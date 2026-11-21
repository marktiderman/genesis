/**
 * `@marktiderman/genesis-native/observability`: crash and error reporting,
 * breadcrumbs, the user id, typed analytics events and timings, through
 * vendor-neutral sinks, with PII scrubbed on the device first.
 *
 * Rung 1: `<GenesisNativeApp blocks={[createObservability({ sinks })]}>`.
 * Settings: `observabilitySettings` (`observability.enabled`, `.sentryDsn`,
 * `.sentryOrg`) start Sentry with no build, through `sentrySink`'s
 * `applySettings` and `cache`.
 * Rung 3: the sinks (`sentrySink`, `observeSink`, `consoleSink`), the
 * scrubber (`scrubEvent`, `scrubString`, …) and `defineEvents`.
 * Rung 4: `useObservability`, `useRecentActivity`.
 *
 * Optional peers, passed in rather than imported: `@sentry/react-native`
 * (`sentrySink`) and `expo-observe` (`observeSink`).
 *
 * @stability Beta
 */
export {
  createObservability,
  OBSERVABILITY_BLOCK_ID,
  ObservabilityProvider,
  useObservability,
  useRecentActivity,
  type ObservabilityBlock,
  type ObservabilityOptions,
  type RecentActivity,
  type RecentError,
  type RecentStore,
} from "./block";
export {
  consoleSink,
  observeSink,
  scrubbedError,
  scrubBreadcrumb,
  type Breadcrumb,
  type BreadcrumbLevel,
  type ConsoleSinkOptions,
  type ErrorContext,
  type ObservabilitySink,
  type ObserveLike,
  type ObserveSinkOptions,
  type RouteErrorBoundaryProps,
  type TimingTags,
} from "./sink";
export {
  sentrySink,
  sentryRelease,
  signatureTags,
  SENTRY_SETTINGS_CACHE_KEY,
  type SentryHealthCheck,
  type SentryLike,
  type SentrySettingsCache,
  type SentrySink,
  type SentrySinkOptions,
  type SentrySinkStatus,
} from "./sentry";
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
export { defineEvents, checkEvent, type EventCheck, type EventPropSpec, type EventProps, type EventSchema, type EventValues } from "./events";
export { ScreenErrorScreen, createScreenErrorBoundary, type ScreenErrorProps } from "../screen-boundary";
export { FILTERED, isSecretKey, scrubEvent, scrubRecord, scrubString, scrubUrl, scrubValue, scrubValueStrict, type ScrubbableEvent } from "./scrub";
