// The Supabase preset: the studio, on, for every table, with one call.

import { supabaseAuth, type StudioClaims } from "./auth";
import { databaseDecides, type ResourceRule } from "./authorize";
import type { StudioDatabase } from "./db";
import { createStudioHandler, type StudioHandler } from "./handler";
import type { StudioHandlerOptions } from "./options";

export interface SupabaseStudioOptions
  extends Partial<Omit<StudioHandlerOptions, "database" | "auth" | "authorize">> {
  /** The project URL, e.g. `https://abcd.supabase.co`. Tokens are verified against its signing keys. */
  url: string;
  /**
   * The studio's own Postgres login (see `genesis studio init`): a NOINHERIT
   * role that can only become `authenticated`. Never the service role or
   * `postgres`, which bypass row rules.
   */
  database: string | StudioDatabase;
  /** Only for projects still on the legacy HS256 JWT secret. */
  jwtSecret?: string;
  /** Who may open the studio. Default: any signed-in, non-anonymous user (see `databaseDecides`). */
  who?: (claims: StudioClaims) => boolean;
  /** Tables to leave out. */
  except?: readonly string[];
  /** Tighter rules for some tables. */
  rules?: Readonly<Record<string, ResourceRule>>;
}

/**
 * The studio handler for a Supabase project, on for every table in
 * `public`: each user sees and edits what their row rules allow, every
 * write is version-checked and audited (`genesis_studio.audit_log`, from
 * `genesis studio init`'s migration), and anything else is opt-in.
 *
 * @example Next.js — `app/api/studio/route.ts`
 * ```ts
 * import { supabaseStudio } from "@marktiderman/genesis-studio-server";
 * export const POST = supabaseStudio({
 *   url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   database: process.env.STUDIO_DATABASE_URL!,
 * });
 * ```
 */
export function supabaseStudio(options: SupabaseStudioOptions): StudioHandler {
  const { url, jwtSecret, who, except, rules, ...rest } = options;
  return createStudioHandler({
    audit: { sink: "table" },
    schemas: ["public"],
    ...rest,
    auth: supabaseAuth({ url, ...(jwtSecret ? { jwtSecret } : {}) }),
    authorize: databaseDecides({ ...(who ? { who } : {}), ...(except ? { except } : {}), ...(rules ? { rules } : {}) }),
  });
}
