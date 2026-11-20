/**
 * The app's health checks: Supabase answers, and this device has a session. The devtools overlay
 * runs them (when its sheet opens, and on "Run checks"); support's context dump carries their
 * latest results. Packages register theirs in the same registry.
 */
import { healthChecks, supabaseHealthChecks } from "@marktiderman/genesis-support";
import { supabase } from "./supabase";

healthChecks.register(...supabaseHealthChecks(supabase));

export { healthChecks };
