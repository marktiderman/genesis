/**
 * `database-elsewhere`: an app whose database files live in another app
 * (genesis.config.json `supabase.app`), or nowhere (`"supabase": false`).
 *
 * - **warn**: `supabase.app` names a folder with no `supabase/`, so nothing
 *   holds this app's database files.
 * - **warn**: the app still has a `supabase/` folder of its own. `genesis add`,
 *   `migrate` and `upgrade` never plan it, so it drifts from the database the
 *   app uses: a second, unused copy. Delete it.
 *
 * The supabase pack doesn't run in such an app: the owning app's doctor checks
 * its migrations.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { databaseElsewhere } from "../blocks/database.js";
import type { DoctorContext } from "./types.js";

export function checkDatabaseHome(ctx: DoctorContext): void {
  const home = databaseElsewhere(ctx.root);
  if (!home) return;
  if (home.app && !home.hasSupabase) {
    ctx.report({
      rule: "database-elsewhere",
      level: "warn",
      file: "genesis.config.json",
      subject: home.app,
      message: `supabase.app is ${home.app}, which has no supabase folder; name the app that holds this app's database (its migrations, tests and Edge Functions)`,
    });
  }
  if (existsSync(path.join(ctx.root, "supabase"))) {
    ctx.report({
      rule: "database-elsewhere",
      level: "warn",
      file: "supabase",
      subject: "supabase/",
      message: `is here, but genesis.config.json says this app's database files live ${home.app ? `in ${home.app}/supabase` : "nowhere"}: genesis add, migrate and upgrade never plan it, so it is a second, unused copy. Delete it`,
    });
  }
}
