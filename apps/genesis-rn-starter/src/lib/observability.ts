/**
 * The observability block (`features.observability`): every error the shell
 * catches, route breadcrumbs and timings, the signed-in user's id and the
 * typed analytics events below, through Sentry (when `EXPO_PUBLIC_SENTRY_DSN`
 * is set) and, in development, the console. Emails, tokens, keys and query
 * strings are scrubbed on the phone before anything is sent.
 *
 * Built here, at module scope, so `Sentry.init` runs before the root layout
 * renders: `app.ts` imports this file before anything else of the app's.
 */
import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import type { ComponentType } from "react";
import { Platform } from "react-native";
import { consoleSink, createObservability, defineEvents, sentrySink } from "@marktiderman/genesis-native/observability";
import { versionSignature } from "@marktiderman/genesis-native/updates";
import starter from "../../starter.config";

/** Every analytics event the app sends, and the props each may carry (closed lists, numbers, booleans: never free text). */
export const events = defineEvents({
  "auth.signed_out": {},
  "account.deleted": {},
});

export const observability = starter.features.observability
  ? createObservability({
      events,
      useSegments,
      sinks: [
        __DEV__ && consoleSink(),
        sentrySink(Sentry, {
          dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
          signature: versionSignature({ application: Application, updates: Updates, platform: Platform.OS }),
          applicationId: Application.applicationId,
        }),
      ],
    })
  : undefined;

/** The root layout, wrapped by Sentry (touch and profiler boundaries) when the block is on. */
export function wrapRoot<P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P> {
  return observability ? observability.wrap(root) : root;
}
