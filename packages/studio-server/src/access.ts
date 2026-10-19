// ---------------------------------------------------------------------------
// What this user may do with a table: the app's `authorize()` AND the
// database's own privileges, never more than either allows (decision 8),
// plus the write-safety preconditions (a trusted version field and an audit
// sink) without which a table stays read-only.
// ---------------------------------------------------------------------------

import type {
  FieldSchema,
  ResourceSchema,
  ResourceSummary,
  StorageType,
  WidgetHint,
} from "@marktiderman/genesis-core/schema";
import type { StudioClaims } from "./auth";
import { canExecuteAudit, triggerAdvances, versionKind, type CatalogColumn, type CatalogTable } from "./catalog";
import type { Query } from "./db";
import type { AuthorizeDecision, StudioAction, StudioHandlerOptions } from "./options";
import { AUDIT_FUNCTION } from "./setup-sql";

const AUDIT_SIGNATURE_ARGS = "(text, jsonb, text, jsonb, jsonb)";
const DEFAULT_VERSION_FIELDS = ["updated_at", "version"];

export interface ResolvedResource {
  table: CatalogTable;
  schema: ResourceSchema;
  /** Columns this user may read, in table order. The only ones ever selected. */
  readable: CatalogColumn[];
  /** Columns this user may update. */
  updatable: ReadonlySet<string>;
  /** Primary-key columns, in key order. Empty when rows can't be addressed. */
  key: CatalogColumn[];
  /** The trusted version column, when the table is writable. */
  version: CatalogColumn | null;
  /** Audit function to call, for the `table` sink. */
  auditFunction: string | null;
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
  /** Memo for the audit-function check, which is the same for every table. */
  auditExecutable?: Promise<boolean>;
}

async function decide(ctx: AccessContext, resource: string, action: StudioAction): Promise<NormalizedDecision> {
  return normalize(await ctx.options.authorize({ request: ctx.request, claims: ctx.claims, resource, action }));
}

function auditFunctionName(ctx: AccessContext): string | null {
  const audit = ctx.options.audit;
  if (!audit || audit.sink !== "table") return null;
  return audit.function ?? AUDIT_FUNCTION;
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
  if (column.enumValues) return "select";
  if (column.category === "B") return "checkbox";
  if (column.category === "N") return "number";
  if (column.baseType === "date") return "date";
  if (column.baseType === "json" || column.baseType === "jsonb") return "textarea";
  return "text";
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
      return { column: null, reason: `Read-only: "${name}" can't be a version field (it must be an integer or a timestamp).` };
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

/**
 * Resolve one table for this user, or `null` when they may not see it at all
 * (which callers report exactly like a table that does not exist).
 */
export async function resolveResource(ctx: AccessContext, table: CatalogTable): Promise<ResolvedResource | null> {
  const resource = table.qualified;
  const read = await decide(ctx, resource, "read");
  if (!read.allow || !table.canSelectAny) return null;

  const isReadable = (c: CatalogColumn) => c.canSelect && read.allows(c.name);
  const readable = table.columns.filter(isReadable);
  if (readable.length === 0) return null;

  const update = await decide(ctx, resource, "update");
  const settings = ctx.options.resources?.[resource];
  const keyColumns = table.primaryKey
    .map((name) => table.columns.find((c) => c.name === name))
    .filter((c): c is CatalogColumn => Boolean(c));
  const keyReadable = keyColumns.length > 0 && keyColumns.every(isReadable);

  // Table-level reasons the table is read-only, most fundamental first.
  let tableReason: string | undefined;
  let version: CatalogColumn | null = null;
  const auditFunction = auditFunctionName(ctx);
  if (!update.allow) {
    tableReason = update.reason ?? "Read-only: editing isn't enabled for this table.";
  } else if (!ctx.options.audit) {
    tableReason = "Read-only: no audit sink is configured, and nothing is edited without an audit entry.";
  } else if (keyColumns.length === 0) {
    tableReason = "Read-only: this table has no primary key, so a row can't be addressed safely.";
  } else if (!keyReadable) {
    tableReason = "Read-only: you can't see this table's key.";
  } else if (!table.canUpdateAny) {
    tableReason = "Read-only: the database doesn't let you update this table.";
  } else {
    const picked = pickVersion(table, isReadable, settings?.versionField);
    version = picked.column;
    tableReason = picked.reason;
  }
  if (!tableReason && auditFunction) {
    ctx.auditExecutable ??= canExecuteAudit(ctx.query, `${auditFunction}${AUDIT_SIGNATURE_ARGS}`);
    if (!(await ctx.auditExecutable)) {
      tableReason = `Read-only: the audit function ${auditFunction} isn't installed, or you can't run it.`;
    }
  }
  if (tableReason) version = null;

  const keyNames = new Set(table.primaryKey);
  const updatable = new Set<string>();
  const columnReason = (c: CatalogColumn): string | undefined => {
    if (tableReason) return tableReason;
    if (keyNames.has(c.name)) return "Key fields can't be edited.";
    if (version && c.name === version.name) return "The database sets the version field.";
    if (c.generated || c.identity) return "The database computes this field.";
    if (c.isArray) return "List fields can't be edited in this version.";
    if (!c.canUpdate) return "The database doesn't let you update this field.";
    if (!update.allows(c.name)) return "Editing this field isn't enabled.";
    return undefined;
  };

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
      ...(c.references
        ? { references: { resource: `${c.references.schema}.${c.references.table}`, field: c.references.column } }
        : {}),
      permissions: { read: true, update: !reason, ...(reason ? { reason } : {}) },
    };
  });

  const schema: ResourceSchema = {
    name: resource,
    label: settings?.label ?? labelFor(table.name),
    key: keyReadable ? (keyColumns.length === 1 ? keyColumns[0]!.name : keyColumns.map((c) => c.name)) : [],
    fields,
    ...(table.description ? { description: table.description } : {}),
    access: {
      read: true,
      update: updatable.size > 0,
      ...(updatable.size === 0 ? { reason: tableReason ?? "Read-only: none of these fields can be edited." } : {}),
    },
    ...(version ? { version: { field: version.name, kind: versionKind(version)! } } : {}),
  };

  return {
    table,
    schema,
    readable,
    updatable,
    key: keyReadable ? keyColumns : [],
    version,
    auditFunction: version ? auditFunction : null,
  };
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
