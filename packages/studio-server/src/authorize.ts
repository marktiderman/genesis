import type { StudioClaims } from "./auth";
import type { Authorize } from "./options";

export interface ResourceRule {
  /**
   * `true` for every column, or `{ except }` to keep some columns out of the
   * studio. Hiding a column here is not a security boundary: revoke it in the
   * database too if the same user can reach the table another way.
   */
  read?: true | { except: readonly string[] };
  /** `true` for every column the database lets them update, or just these columns. */
  update?: true | readonly string[];
  /** `true` to let them add rows (any field the database lets them set), or just these fields. */
  create?: true | readonly string[];
  /** `true` to let them delete rows they can see. */
  delete?: true;
  /** `true` to let them read a row's audit history (only fields they can read). */
  history?: true;
  /** `true` for every row action configured on the table, or just these. */
  actions?: true | readonly string[];
  /** `true` to let them read and add comments on rows they can see. */
  comment?: true;
}

export interface ByResourceOptions {
  /**
   * Who may use the studio at all, from their verified claims. Required:
   * on Supabase every signed-in user holds the same `authenticated` role,
   * including customers who signed themselves up, so "signed in" alone is
   * almost never the right answer.
   *
   * @example (claims) => claims.app_metadata?.role === "staff"
   */
  who: (claims: StudioClaims) => boolean;
}

/**
 * The common case of `authorize`: a fixed allow-list by `schema.table`, for
 * the users `who` admits. Anything not listed is denied, and a listed table
 * without `update` is read-only.
 *
 * @example
 * byResource(
 *   {
 *     "public.clients": { read: true, update: ["notes", "status"] },
 *     "public.sessions": { read: true },
 *   },
 *   { who: (claims) => (claims.app_metadata as { role?: string } | undefined)?.role === "coach" },
 * )
 */
export function byResource(rules: Readonly<Record<string, ResourceRule>>, options: ByResourceOptions): Authorize {
  if (typeof options?.who !== "function") {
    throw new Error("byResource needs `who`: decide which signed-in users may use the studio.");
  }
  return ({ resource, action, claims, rowAction }) => {
    if (!options.who(claims)) return false;
    const rule = Object.prototype.hasOwnProperty.call(rules, resource) ? rules[resource] : undefined;
    if (!rule) return false;
    if (action === "read") {
      if (!rule.read) return false;
      return rule.read === true ? true : { allow: true, exceptColumns: rule.read.except };
    }
    if (action === "delete") return rule.delete === true;
    if (action === "history") return rule.history === true;
    if (action === "comment") return rule.comment === true;
    if (action === "run") {
      if (!rule.actions) return false;
      return rule.actions === true || (rowAction !== undefined && rule.actions.includes(rowAction));
    }
    const columns = action === "create" ? rule.create : rule.update;
    if (!columns) return false;
    return columns === true ? true : { allow: true, columns };
  };
}

export interface DatabaseDecidesOptions {
  /**
   * Who may open the studio, from their verified claims. Default: any
   * signed-in, non-anonymous user. That's safe because the studio acts as
   * them, so they get exactly what the database already lets them do through
   * its own Data API, and nothing more. Narrow it to keep the UI to staff.
   */
  who?: (claims: StudioClaims) => boolean;
  /** Tables (`schema.table`) to leave out of the studio entirely. */
  except?: readonly string[];
  /** Tighter rules for some tables, in `byResource` form. Tables not listed get everything the database allows. */
  rules?: Readonly<Record<string, ResourceRule>>;
}

/**
 * Turn the studio on for every table, and let the database decide: each
 * user reads, edits, adds and deletes exactly what their grants and row
 * rules allow, sees history and comments on the rows they can see, and runs
 * the row actions configured for a table. This is the default the studio is
 * built around ("a signed-in user sees and edits exactly what they already
 * can"); `byResource` is the opt-in allow-list for apps that want less.
 *
 * @example authorize: databaseDecides({ who: (claims) => claims.app_metadata?.role === "staff" })
 */
export function databaseDecides(options: DatabaseDecidesOptions = {}): Authorize {
  const who = options.who ?? ((claims: StudioClaims) => typeof claims.sub === "string" && claims.is_anonymous !== true);
  const except = new Set(options.except ?? []);
  const narrowed = options.rules ? byResource(options.rules, { who }) : null;
  return (context) => {
    if (!who(context.claims) || except.has(context.resource)) return false;
    if (narrowed && options.rules && Object.prototype.hasOwnProperty.call(options.rules, context.resource)) {
      return narrowed(context);
    }
    return true;
  };
}
