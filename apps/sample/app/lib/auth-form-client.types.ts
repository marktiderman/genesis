/**
 * Compile-time guard: genesis-supabase's `createAuthFormClient` is a client
 * genesis-ui's `AuthForm` takes.
 *
 * The two packages don't depend on each other, so neither can check this
 * itself. `apps/sample` depends on both and CI typechecks it, so a change to
 * either side that breaks the fit fails here.
 *
 * Type-only: no runtime export, nothing imports this at runtime.
 */
import type { AuthFormClient } from "@marktiderman/genesis-ui/patterns";
import type { AuthFormSupabaseClient } from "@marktiderman/genesis-supabase";

// The assertion the supabase package's test held (`expectTypeOf<AuthFormSupabaseClient>().toExtend<AuthFormClient>()`),
// in plain TypeScript so app code doesn't import vitest.
type Fits = AuthFormSupabaseClient extends AuthFormClient ? true : false;
export const authFormSupabaseClientFits: Fits = true;
