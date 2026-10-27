/**
 * `@marktiderman/genesis-native/observability`: crash and error reporting,
 * breadcrumbs, the user id, typed analytics events and timings, through
 * vendor-neutral sinks, with PII scrubbed on the device first.
 *
 * Rung 1: `<GenesisNativeApp blocks={[createObservability({ sinks })]}>`.
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
export { sentrySink, sentryRelease, signatureTags, type SentryLike, type SentrySinkOptions } from "./sentry";
export { defineEvents, checkEvent, type EventCheck, type EventPropSpec, type EventProps, type EventSchema, type EventValues } from "./events";
export { ScreenErrorScreen, createScreenErrorBoundary, type ScreenErrorProps } from "../screen-boundary";
export { FILTERED, isSecretKey, scrubEvent, scrubRecord, scrubString, scrubUrl, scrubValue, type ScrubbableEvent } from "./scrub";
