// ---------------------------------------------------------------------------
// What this user may do with a table: the app's `authorize()` AND the
// database's own privileges, never more than either allows (decision 8),
// plus the write-safety preconditions (a trusted version field and an audit
// sink) without which a table stays read-only.
// ---------------------------------------------------------------------------

import type {
  FieldSchema,
  ResourceAccess,
  ResourceRelation,
  ResourceSchema,
  ResourceSummary,
  StorageType,
  WidgetHint,
} from "@marktiderman/genesis-core/schema";
import type { StudioClaims } from "./auth";
import {
  auditSinkProblem,
  functionProblem,
  triggerAdvances,
  triggerAuditsEvery,
  versionKind,
  type CatalogColumn,
  type CatalogTable,
} from "./catalog";
import type { Query } from "./db";
import type { AuthorizeDecision, StudioAction, StudioHandlerOptions } from "./options";
import { AUDIT_FUNCTION, HISTORY_FUNCTION, OUTBOX_AUDIT_FUNCTION } from "./setup-sql";

const AUDIT_SIGNATURE_ARGS = "(text, jsonb, text, jsonb, jsonb)";
const DEFAULT_VERSION_FIELDS = ["updated_at", "version"];
const LABEL_FIELDS = ["name", "title", "label", "full_name", "display_name", "email", "slug"];

/** The write actions, each with its own preconditions. */
export type WriteAction = "update" | "create" | "delete";

export interface ResolvedResource {
  table: CatalogTable;
  schema: ResourceSchema;
  /** Columns this user may read, in table order. The only ones ever selected. */
  readable: CatalogColumn[];
  /** Columns this user may update. */
  updatable: ReadonlySet<string>;
  /** Columns this user may set on a new row. Empty when creating isn't allowed. */
  creatable: ReadonlySet<string>;
  /** Primary-key columns, in key order. Empty when rows can't be addressed. */
  key: CatalogColumn[];
  /** The trusted version column, when updates or deletes are allowed. */
  version: CatalogColumn | null;
  /** Audit function to call (`table` and `outbox` sinks); null for `database`. */
  auditFunction: string | null;
  /** Why each write action is off, or undefined when it's allowed. */
  blocked: Readonly<Record<WriteAction, string | undefined>>;
  /** Why reading history is off, or undefined when it's allowed. */
  historyBlocked: string | undefined;
  /** App functions that carry each write (decision 29), when configured. */
  functions: Readonly<Partial<Record<WriteAction, string>>>;
}

interface NormalizedDecision {
  allow: boolean;
  reason?: string;
  allows(column: string): boolean;
}

function normalize(decision: AuthorizeDecision | undefined): NormalizedDecision {
  if (decision === true) return { allow: true, allows: () => true };
  if (!decision) return { allow: false, allows: () => false };
  if (!decision.allow) return { allow: false, reason: decision.reason, allows: () => false };
  const only = decision.columns ? new Set(decision.columns) : null;
  const except = new Set(decision.exceptColumns ?? []);
  return {
    allow: true,
    reason: decision.reason,
    allows: (column) => (only ? only.has(column) : true) && !except.has(column),
  };
}

/** Per-request context shared by every resource resolved in it. */
export interface AccessContext {
  request: Request;
  claims: StudioClaims;
  query: Query;
  options: StudioHandlerOptions;
  /** Memos for checks that are the same for every table in a request. */
  auditProblem?: Promise<string | null>;
  functionProblems?: Map<string, Promise<string | null>>;
}

async function decide(ctx: AccessContext, resource: string, action: StudioAction): Promise<NormalizedDecision> {
  return normalize(await ctx.options.authorize({ request: ctx.request, claims: ctx.claims, resource, action }));
}

function auditFunctionName(ctx: AccessContext): string | null {
  const audit = ctx.options.audit;
  if (!audit || audit.sink === "database") return null;
  return audit.function ?? (audit.sink === "outbox" ? OUTBOX_AUDIT_FUNCTION : AUDIT_FUNCTION);
}

function memoFunctionProblem(ctx: AccessContext, signature: string): Promise<string | null> {
  ctx.functionProblems ??= new Map();
  let problem = ctx.functionProblems.get(signature);
  if (!problem) {
    problem = functionProblem(ctx.query, signature);
    ctx.functionProblems.set(signature, problem);
  }
  return problem;
}

function storageType(column: CatalogColumn): StorageType {
  switch (column.category) {
    case "N":
      return "number";
    case "B":
      return "boolean";
    case "D":
      return "datetime";
    default:
      return column.baseType === "json" || column.baseType === "jsonb" ? "json" : "string";
  }
}

function widget(column: CatalogColumn): WidgetHint | undefined {
  if (column.isArray) return undefined;
  if (column.references) return "relation";
  if (column.enumValues) return "select";
  if (column.category === "B") return "checkbox";
  if (column.category === "N") return "number";
  if (column.baseType === "date") return "date";
  if (column.baseType === "json" || column.baseType === "jsonb") return "textarea";
  return "text";
}

function schemasOf(ctx: AccessContext): readonly string[] {
  return ctx.options.schemas ?? ["public"];
}

function databaseAuditTrigger(table: CatalogTable, name: string | undefined, action: WriteAction): boolean {
  if (!name) return false;
  return table.triggers.some((t) => t.name === name && triggerAuditsEvery(t, action));
}

function labelFor(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickVersion(
  table: CatalogTable,
  readable: (column: CatalogColumn) => boolean,
  configured: string | undefined,
): { column: CatalogColumn | null; reason?: string } {
  const candidates = configured ? [configured] : DEFAULT_VERSION_FIELDS;
  for (const name of candidates) {
    const column = table.columns.find((c) => c.name === name);
    if (!column) continue;
    if (!versionKind(column)) {
      return {
        column: null,
        reason:
          `Read-only: "${name}" can't be a version field. It must be an integer, or a timestamp with ` +
          "microsecond precision so two quick edits can't share one value.",
      };
    }
    if (!readable(column)) {
      return { column: null, reason: `Read-only: you can't read the version field "${name}".` };
    }
    if (!table.triggers.some((t) => triggerAdvances(t, name))) {
      return {
        column: null,
        reason:
          `Read-only: no trigger advances "${name}" on every update, so an edit couldn't be checked against ` +
          `someone else's. Add one, e.g. moddatetime(${name}).`,
      };
    }
    return { column };
  }
  return {
    column: null,
    reason: configured
      ? `Read-only: the version field "${configured}" doesn't exist.`
      : `Read-only: no "updated_at" or "version" field to check edits against.`,
  };
}

const VERBS: Record<WriteAction, { done: string; noun: string }> = {
  update: { done: "editing", noun: "edit" },
  create: { done: "adding rows", noun: "new row" },
  delete: { done: "deleting rows", noun: "deletion" },
};

/**
 * Resolve one table for this user, or `null` when they may not see it at all
 * (which callers report exactly like a table that does not exist).
 *
 * Pass `catalog` (every table in the configured schemas) to also work out
 * the table's relations; without it, `relations` is left out.
 */
export async function resolveResource(
  ctx: AccessContext,
  table: CatalogTable,
  catalog?: readonly CatalogTable[],
): Promise<ResolvedResource | null> {
  const resource = table.qualified;
  const read = await decide(ctx, resource, "read");
  if (!read.allow || !table.canSelectAny) return null;

  const isReadable = (c: CatalogColumn) => c.canSelect && read.allows(c.name);
  const readable = table.columns.filter(isReadable);
  if (readable.length === 0) return null;

  const [update, create, del, history] = await Promise.all([
    decide(ctx, resource, "update"),
    decide(ctx, resource, "create"),
    decide(ctx, resource, "delete"),
    decide(ctx, resource, "history"),
  ]);
  const settings = ctx.options.resources?.[resource];
  const functions = settings?.functions ?? {};
  const keyColumns = table.primaryKey
    .map((name) => table.columns.find((c) => c.name === name))
    .filter((c): c is CatalogColumn => Boolean(c));
  const keyReadable = keyColumns.length > 0 && keyColumns.every(isReadable);
  const auditFunction = auditFunctionName(ctx);

  // Preconditions every write shares, most fundamental first.
  let common: string | undefined;
  if (!ctx.options.audit) {
    common = "no audit sink is configured, and nothing changes without an audit entry";
  } else if (keyColumns.length === 0) {
    common = "this table has no primary key, so a row can't be addressed safely";
  } else if (!keyReadable) {
    common = "you can't see this table's key";
  } else if (!table.rls && !settings?.allowWithoutRls) {
    common =
      "row-level security is off for this table, so anyone who may change it could change every row. " +
      "Turn RLS on, or opt in with allowWithoutRls";
  } else if (auditFunction) {
    // The stock functions write genesis_studio.audit_log, so check it too.
    const stock = auditFunction === AUDIT_FUNCTION || auditFunction === OUTBOX_AUDIT_FUNCTION;
    ctx.auditProblem ??= auditSinkProblem(ctx.query, `${auditFunction}${AUDIT_SIGNATURE_ARGS}`, stock);
    const problem = await ctx.auditProblem;
    if (problem) common = `the audit function ${auditFunction} ${problem}`;
  }

  const decisions: Record<WriteAction, NormalizedDecision> = { update, create, delete: del };
  const fnArgs: Record<WriteAction, string> = { update: "(jsonb, jsonb)", create: "(jsonb)", delete: "(jsonb)" };
  const blockedRaw: Record<WriteAction, string | undefined> = { update: undefined, create: undefined, delete: undefined };
  for (const action of ["update", "create", "delete"] as const) {
    const decision = decisions[action];
    const fn = functions[action];
    if (!decision.allow) {
      // An app's own reason is shown as written.
      blockedRaw[action] = decision.reason ?? `${VERBS[action].done} isn't enabled for this table`;
      continue;
    }
    if (common) {
      blockedRaw[action] = common;
      continue;
    }
    if (ctx.options.audit?.sink === "database" && !databaseAuditTrigger(table, settings?.auditTrigger, action)) {
      blockedRaw[action] = settings?.auditTrigger
        ? `the audit trigger "${settings.auditTrigger}" doesn't exist, is disabled, or doesn't fire on every ${VERBS[action].noun}`
        : "name the trigger that audits this table (auditTrigger), so nothing changes without an audit entry";
      continue;
    }
    if (fn) {
      const problem = await memoFunctionProblem(ctx, `${fn}${fnArgs[action]}`);
      if (problem) blockedRaw[action] = `the ${action} function ${fn}${fnArgs[action]} ${problem}`;
      continue;
    }
    if (action === "update" && !table.canUpdateAny) blockedRaw.update = "the database doesn't let you update this table";
    if (action === "create" && !table.canInsertAny) blockedRaw.create = "the database doesn't let you add rows to this table";
    if (action === "delete" && !table.canDelete) blockedRaw.delete = "the database doesn't let you delete from this table";
  }

  // Updates and deletes are version-checked.
  let version: CatalogColumn | null = null;
  if (!blockedRaw.update || !blockedRaw.delete) {
    const picked = pickVersion(table, isReadable, settings?.versionField);
    version = picked.column;
    if (!version) {
      const why = picked.reason!.replace(/^Read-only: /, "");
      if (!blockedRaw.update) blockedRaw.update = why;
      if (!blockedRaw.delete) blockedRaw.delete = why;
    }
  }
  // Studio reasons read "Read-only: <why>."; an app's own reason is kept as is.
  const sentence = (action: WriteAction, why: string | undefined) => {
    if (why === undefined) return undefined;
    if (!decisions[action].allow && decisions[action].reason) return why;
    return `Read-only: ${why.replace(/\.$/, "")}.`;
  };
  const blocked: Record<WriteAction, string | undefined> = {
    update: sentence("update", blockedRaw.update),
    create: sentence("create", blockedRaw.create),
    delete: sentence("delete", blockedRaw.delete),
  };

  let historyBlocked: string | undefined;
  if (!history.allow) historyBlocked = history.reason ?? "Reading this table's history isn't enabled.";
  else if (!keyReadable) historyBlocked = "You can't see this table's key, so its history can't be looked up.";
  else if (!ctx.options.audit || ctx.options.audit.sink === "database") {
    historyBlocked = "History is shown from the studio's audit log, and this app audits in its own tables.";
  } else {
    const problem = await memoFunctionProblem(ctx, `${HISTORY_FUNCTION}(text, jsonb, int)`);
    if (problem) historyBlocked = `The history function ${HISTORY_FUNCTION} ${problem}.`;
  }

  const keyNames = new Set(table.primaryKey);
  const updatable = new Set<string>();
  const creatable = new Set<string>();
  const columnReason = (c: CatalogColumn): string | undefined => {
    if (blocked.update) return blocked.update;
    if (keyNames.has(c.name)) return "Key fields can't be edited.";
    if (version && c.name === version.name) return "The database sets the version field.";
    if (c.generated || c.identity) return "The database computes this field.";
    if (c.isArray) return "List fields can't be edited in this version.";
    // A rule-bearing write goes through the app's function, which may hold
    // privileges the user doesn't; the column grant only bounds a direct write.
    if (!functions.update && !c.canUpdate) return "The database doesn't let you update this field.";
    if (!update.allows(c.name)) return "Editing this field isn't enabled.";
    return undefined;
  };
  if (!blocked.create) {
    for (const c of readable) {
      // Computed, identity and list fields are left to the database.
      if (c.generated || c.identity || c.isArray) continue;
      if (!functions.create && !c.canInsert) continue;
      if (!create.allows(c.name)) continue;
      creatable.add(c.name);
    }
    if (creatable.size === 0) blocked.create = "Read-only: there are no fields you may set on a new row.";
  }

  const fields: FieldSchema[] = readable.map((c) => {
    const reason = columnReason(c);
    if (!reason) updatable.add(c.name);
    return {
      name: c.name,
      type: storageType(c),
      dbType: c.dbType,
      widget: widget(c),
      ...(c.isArray ? { array: true } : {}),
      nullable: c.nullable,
      optional: c.nullable || c.hasDefault || c.generated || c.identity,
      hasDefault: c.hasDefault,
      ...(c.generated || c.identity ? { generated: true } : {}),
      ...(c.enumValues ? { enumValues: c.enumValues } : {}),
      ...(c.description ? { description: c.description } : {}),
      // Only link to tables the studio could show; a reference into another
      // schema would name a table this user was never offered.
      ...(c.references && schemasOf(ctx).includes(c.references.schema)
        ? { references: { resource: `${c.references.schema}.${c.references.table}`, field: c.references.column } }
        : {}),
      permissions: { read: true, update: !reason, ...(reason ? { reason } : {}) },
    };
  });

  const access: ResourceAccess = {
    read: true,
    update: updatable.size > 0,
    ...(updatable.size === 0 ? { reason: blocked.update ?? "Read-only: none of these fields can be edited." } : {}),
    create: !blocked.create,
    delete: !blocked.delete,
    history: !historyBlocked,
    ...(blocked.create || blocked.delete || historyBlocked
      ? {
          reasons: {
            ...(blocked.create ? { create: blocked.create } : {}),
            ...(blocked.delete ? { delete: blocked.delete } : {}),
            ...(historyBlocked ? { history: historyBlocked } : {}),
          },
        }
      : {}),
  };

  const relations = catalog ? await relationsFor(ctx, table, readable, catalog) : undefined;

  const schema: ResourceSchema = {
    name: resource,
    label: settings?.label ?? labelFor(table.name),
    key: keyReadable ? (keyColumns.length === 1 ? keyColumns[0]!.name : keyColumns.map((c) => c.name)) : [],
    fields,
    ...(table.description ? { description: table.description } : {}),
    access,
    ...(version ? { version: { field: version.name, kind: versionKind(version)! } } : {}),
    labelField: pickLabelField(readable, keyColumns, settings?.labelField),
    ...(relations && relations.length ? { relations } : {}),
    ...(creatable.size ? { createFields: [...creatable] } : {}),
  };

  return {
    table,
    schema,
    readable,
    updatable,
    creatable,
    key: keyReadable ? keyColumns : [],
    version,
    auditFunction,
    blocked,
    historyBlocked,
    functions,
  };
}

function pickLabelField(readable: CatalogColumn[], key: CatalogColumn[], configured: string | undefined): string {
  if (configured && readable.some((c) => c.name === configured)) return configured;
  for (const name of LABEL_FIELDS) if (readable.some((c) => c.name === name)) return name;
  const keyNames = new Set(key.map((k) => k.name));
  const text = readable.find((c) => c.category === "S" && !c.isArray && !keyNames.has(c.name) && !c.references);
  return text?.name ?? key[0]?.name ?? readable[0]!.name;
}

/**
 * The table's relations, from single-column foreign keys in either
 * direction, limited to tables (and linking fields) this user may read.
 */
async function relationsFor(
  ctx: AccessContext,
  table: CatalogTable,
  readable: CatalogColumn[],
  catalog: readonly CatalogTable[],
): Promise<ResourceRelation[]> {
  const visible = new Map<string, { table: CatalogTable; canRead: (column: string) => boolean }>();
  const visibleTable = async (other: CatalogTable) => {
    if (visible.has(other.qualified)) return visible.get(other.qualified) ?? null;
    const decision = await decide(ctx, other.qualified, "read");
    const entry =
      decision.allow && other.canSelectAny
        ? {
            table: other,
            canRead: (column: string) =>
              decision.allows(column) && Boolean(other.columns.find((c) => c.name === column)?.canSelect),
          }
        : null;
    if (entry) visible.set(other.qualified, entry);
    return entry;
  };
  const byName = new Map(catalog.map((t) => [t.qualified, t]));
  const out: ResourceRelation[] = [];

  for (const c of readable) {
    if (!c.references) continue;
    const target = byName.get(`${c.references.schema}.${c.references.table}`);
    if (!target || !(await visibleTable(target))) continue;
    out.push({ kind: "one", resource: target.qualified, field: c.name });
  }

  // Inbound links point at this table's key, so this table needs one.
  if (table.primaryKey.length !== 1) return out;
  const key = table.primaryKey[0]!;
  for (const other of catalog) {
    for (const c of other.columns) {
      const ref = c.references;
      if (!ref || `${ref.schema}.${ref.table}` !== table.qualified || ref.column !== key) continue;
      const seen = await visibleTable(other);
      if (!seen || !seen.canRead(c.name)) continue;
      // A junction: its key is exactly two foreign keys, this one and another.
      const otherKey = other.primaryKey.length === 2 ? other.primaryKey.find((k) => k !== c.name) : undefined;
      const otherRef = otherKey ? other.columns.find((col) => col.name === otherKey)?.references : undefined;
      const far = otherRef ? byName.get(`${otherRef.schema}.${otherRef.table}`) : undefined;
      if (otherKey && other.primaryKey.includes(c.name) && far && seen.canRead(otherKey) && (await visibleTable(far))) {
        out.push({
          kind: "through",
          resource: far.qualified,
          field: c.name,
          through: { resource: other.qualified, otherField: otherKey },
        });
        continue;
      }
      const unique =
        other.uniqueColumns.includes(c.name) || (other.primaryKey.length === 1 && other.primaryKey[0] === c.name);
      out.push({ kind: "many", resource: other.qualified, field: c.name, ...(unique ? { unique: true } : {}) });
    }
  }
  return out;
}

export function summarize(resolved: ResolvedResource): ResourceSummary {
  const { schema } = resolved;
  return {
    name: schema.name,
    ...(schema.label ? { label: schema.label } : {}),
    ...(schema.description ? { description: schema.description } : {}),
    access: schema.access,
  };
}
