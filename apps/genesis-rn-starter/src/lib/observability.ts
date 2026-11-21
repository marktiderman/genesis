/**
 * The observability block (`features.observability`): every error the shell
 * catches, route breadcrumbs and timings, the signed-in user's id and the
 * typed analytics events below, through Sentry and, in development, the
 * console. Emails, tokens, keys and query strings are scrubbed on the phone
 * before anything is sent.
 *
 * Sentry's DSN comes from the build (`EXPO_PUBLIC_SENTRY_DSN`) or, with no
 * build, from Genesis settings: a platform admin sets `observability.sentryDsn`
 * in Settings, `src/lib/settings.ts` hands the settings to `sentry`, and this
 * device keeps them (AsyncStorage) so the next launch starts Sentry at once.
 * Turning `observability.enabled` off stops it live; a new DSN applies at the
 * next launch.
 *
 * Built here, at module scope, so `Sentry.init` runs before the root layout
 * renders: `app.ts` imports this file before anything else of the app's.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import type { ComponentType } from "react";
import { Platform } from "react-native";
import { consoleSink, createObservability, defineEvents, sentrySink } from "@marktiderman/genesis-native/observability";
import { versionSignature } from "@marktiderman/genesis-native/updates";
import starter from "../../starter.config";
import { env } from "./env";

/** Every analytics event the app sends, and the props each may carry (closed lists, numbers, booleans: never free text). */
export const events = defineEvents({
  "auth.signed_out": {},
  "account.deleted": {},
});

/** Sentry, when the block is on: the settings start it, stop it and check it (`applySettings`, `healthCheck`). */
export const sentry = starter.features.observability
  ? sentrySink(Sentry, {
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      // The last settings this device read, so a launch starts Sentry before anyone signs in.
      cache: AsyncStorage,
      signature: versionSignature({ application: Application, updates: Updates, platform: Platform.OS }),
      applicationId: Application.applicationId,
      // Trace headers go to this app's own Supabase project only, never to other hosts.
      tracePropagationTargets: [env.supabaseUrl.replace(/\/+$/, "")],
    })
  : undefined;

export const observability = sentry ? createObservability({ events, useSegments, sinks: [__DEV__ && consoleSink(), sentry] }) : undefined;

/** The root layout, wrapped by Sentry (touch and profiler boundaries) when the block is on. */
export function wrapRoot<P extends Record<string, unknown>>(root: ComponentType<P>): ComponentType<P> {
  return observability ? observability.wrap(root) : root;
}
