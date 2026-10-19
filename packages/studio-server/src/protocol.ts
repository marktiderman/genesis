// ---------------------------------------------------------------------------
// The wire protocol between the browser client (`./client`) and the handler.
//
// One endpoint, POST, JSON in and out. A single route is the easiest thing to
// mount in every host (a Next.js route file, a Hono or Remix route, a
// Cloudflare worker), and a bearer token in a header rather than a cookie
// keeps it out of reach of cross-site request forgery.
// ---------------------------------------------------------------------------

import type {
  AuditEntry,
  DataRow,
  FilterParam,
  ResourceSchema,
  ResourceSummary,
  SortParam,
  WriteOutcome,
} from "@marktiderman/genesis-core";

/** Bumped on any incompatible change; the handler rejects other versions. */
export const STUDIO_PROTOCOL_VERSION = 1;

export type StudioRequest =
  | { op: "resources" }
  | { op: "describe"; resource: string }
  | {
      op: "list";
      resource: string;
      /** 1-based. */
      page?: number;
      perPage?: number;
      sort?: SortParam;
      search?: string;
      filters?: FilterParam[];
    }
  | { op: "read"; resource: string; id: string | number }
  | {
      op: "update";
      resource: string;
      id: string | number;
      /** Field → new value. Values travel as JSON and are cast by the database. */
      data: DataRow;
      /** The version token the row was read at; `null` when it had none. */
      expectedVersion: string | null;
    };

export interface StudioEnvelope {
  /** Protocol version of the sender. */
  v: number;
}

export interface ResourcesResponse {
  resources: ResourceSummary[];
}

export interface DescribeResponse {
  schema: ResourceSchema;
}

/** A row plus its version token, kept apart so a column can't collide with it. */
export interface StudioRow {
  values: DataRow;
  /** Version token, exactly as the database prints it. `null` without one. */
  version: string | null;
}

export interface ListResponse {
  rows: StudioRow[];
  total: number;
}

export interface ReadResponse {
  row: StudioRow;
}

export interface UpdateResponse {
  row: StudioRow;
  /** Present when the handler wrote the audit entry itself (`table` sink). */
  audit?: AuditEntry;
}

/**
 * Every failure has this shape. `outcome` is the same vocabulary the client
 * raises as a `DataWriteError`, plus `not_found` for a resource that does
 * not exist or that this user may not see (the two are deliberately the
 * same answer).
 */
export interface ErrorResponse {
  error: {
    outcome: WriteOutcome | "not_found" | "bad_request";
    message: string;
    current?: DataRow;
    currentVersion?: string | null;
  };
}
