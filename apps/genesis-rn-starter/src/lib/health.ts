/**
 * The app's health checks: Supabase answers, this device has a session, and Sentry's set-up (a
 * DSN that isn't one fails; a change waiting for the next launch warns). The devtools overlay
 * runs them (when its sheet opens, and on "Run checks"); support's context dump carries their
 * latest results. Packages register theirs in the same registry.
 */
import { healthChecks, supabaseHealthChecks } from "@marktiderman/genesis-support";
import { sentry } from "./observability";
import { supabase } from "./supabase";

healthChecks.register(...supabaseHealthChecks(supabase));
if (sentry) healthChecks.register(sentry.healthCheck());

export { healthChecks };
